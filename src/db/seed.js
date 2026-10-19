// src/db/seed.js
import argon2 from 'argon2';
import { migratorPool } from './pool.js';
import { logger } from '../shared/logger.js';
import { config } from '../shared/config.js';

export const OWASP_ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1
};

export async function hashPassword(plainText) {
  return argon2.hash(plainText, OWASP_ARGON2_OPTIONS);
}

export async function seedDatabase(options = { bulk: false }, attempts = 3) {
  if (config.isProduction && !process.env.ALLOW_PROD_SEED) {
    const clientCheck = await migratorPool.connect();
    try {
      const { rows } = await clientCheck.query("SELECT COUNT(*) as count FROM users WHERE email LIKE '%@newtonite.test'");
      if (parseInt(rows[0]?.count || '0', 10) > 0) {
        logger.info('Database already contains seeded demo users; skipping seed in production.');
        return;
      }
      logger.info('Production environment detected with unseeded database. Proceeding with initial seed...');
    } catch (err) {
      logger.warn({ err }, 'Could not check existing users count; skipping seed in production for safety');
      return;
    } finally {
      clientCheck.release();
    }
  }

  logger.info('Seeding database...');
  const client = await migratorPool.connect();
  let released = false;

  try {
    await client.query('BEGIN');

    // Backup non-test accounts and custom workspaces so human users are never wiped by seed/tests
    let customUsers = [];
    let customWorkspaces = [];
    let customWsMemberships = [];
    let customTeams = [];
    let customTeamMemberships = [];

    try {
      const uRes = await client.query(`
        SELECT * FROM users
        WHERE email NOT LIKE '%@newtonite.test' AND email NOT LIKE '%@example.com'
      `);
      customUsers = uRes.rows;

      if (customUsers.length > 0) {
        const customUserIds = customUsers.map(u => u.id);
        const wsRes = await client.query(`
          SELECT * FROM workspaces 
          WHERE id > 1 AND created_by = ANY($1::int[])
        `, [customUserIds]);
        customWorkspaces = wsRes.rows;
        const customWsIds = customWorkspaces.map(w => w.id);

        const wmRes = await client.query(`
          SELECT * FROM workspace_memberships
          WHERE user_id = ANY($1::int[])
            AND (workspace_id = 1 OR workspace_id = ANY($2::int[]))
        `, [customUserIds, customWsIds.length > 0 ? customWsIds : [-1]]);
        customWsMemberships = wmRes.rows;

        if (customWsIds.length > 0) {
          const tmRes = await client.query(`
            SELECT * FROM teams WHERE workspace_id = ANY($1::int[])
          `, [customWsIds]);
          customTeams = tmRes.rows;
          const customTeamIds = customTeams.map(t => t.id);

          if (customTeamIds.length > 0) {
            const tmemRes = await client.query(`
              SELECT * FROM team_memberships
              WHERE user_id = ANY($1::int[]) AND team_id = ANY($2::int[])
            `, [customUserIds, customTeamIds]);
            customTeamMemberships = tmemRes.rows;
          }
        }
      }
    } catch {
      // Tables might not exist on very first fresh run; safely ignore
    }

    // Clean existing data for clean seed
    await client.query(`
      TRUNCATE TABLE 
        workspace_invitations,
        workspace_memberships,
        work_item_assignees,
        work_item_attachments,
        operational_calls,
        on_call_shifts,
        team_messages,
        notifications,
        outbox,
        idempotency_keys,
        work_item_events,
        work_items,
        membership_events,
        team_memberships,
        teams,
        workspaces,
        sessions,
        users
      RESTART IDENTITY CASCADE;
    `);

    // Standard dev password hash
    const defaultHash = await hashPassword('Password123!');

    // 1. Seed standard users
    const usersData = [
      { email: 'alice@newtonite.test', name: 'Alice Walker (Lead)', is_org_admin: false },
      { email: 'bob@newtonite.test', name: 'Bob Vance (Lead)', is_org_admin: false },
      { email: 'charlie@newtonite.test', name: 'Charlie Green (Member)', is_org_admin: false },
      { email: 'dana@newtonite.test', name: 'Dana Scott (Viewer)', is_org_admin: false },
      { email: 'admin@newtonite.test', name: 'Eve Admin (Org Admin)', is_org_admin: true }
    ];

    const userMap = {};
    for (const u of usersData) {
      const { rows } = await client.query(
        `INSERT INTO users (email, name, password_hash, is_org_admin)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email`,
        [u.email, u.name, defaultHash, u.is_org_admin]
      );
      userMap[u.email] = rows[0].id;
    }

    // Seed default Newtonite Workspace
    const { rows: wsRows } = await client.query(
      `INSERT INTO workspaces (name, slug, created_by)
       VALUES ('Newtonite Engineering', 'newtonite', $1)
       RETURNING id`,
      [userMap['alice@newtonite.test']]
    );
    const defaultWorkspaceId = wsRows[0].id;

    for (const [email, uId] of Object.entries(userMap)) {
      const wsRole = ['alice@newtonite.test', 'bob@newtonite.test'].includes(email) ? 'owner' : (email === 'admin@newtonite.test' ? 'admin' : 'member');
      await client.query(
        `INSERT INTO workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [defaultWorkspaceId, uId, wsRole]
      );
    }

    // Seed reusable demo invite code for workspace 1
    await client.query(
      `INSERT INTO workspace_invitations (workspace_id, team_id, code, role, expires_at)
       VALUES ($1, NULL, 'DEMO-NEWTONITE', 'member', '2099-01-01')
       ON CONFLICT (code) DO NOTHING`,
      [defaultWorkspaceId]
    );

    // 2. Seed Teams (Each team key matches candidate brief categories)
    const teamsData = [
      { name: 'Operations & Incidents', key: 'OPS' },
      { name: 'Payments & Settlement', key: 'PAY' },
      { name: 'Platform Engineering', key: 'ENG' }
    ];

    const teamMap = {};
    for (const t of teamsData) {
      const { rows } = await client.query(
        `INSERT INTO teams (name, key, workspace_id)
         VALUES ($1, $2, $3)
         RETURNING id, key`,
        [t.name, t.key, defaultWorkspaceId]
      );
      teamMap[t.key] = rows[0].id;
    }

    // 3. Seed Team Memberships (Two leads per team for separation of duties!)
    for (const teamKey of Object.keys(teamMap)) {
      const teamId = teamMap[teamKey];

      // Alice (Lead)
      await client.query(
        `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'lead')`,
        [teamId, userMap['alice@newtonite.test']]
      );
      // Bob (Lead)
      await client.query(
        `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'lead')`,
        [teamId, userMap['bob@newtonite.test']]
      );
      // Charlie (Member)
      await client.query(
        `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`,
        [teamId, userMap['charlie@newtonite.test']]
      );
      // Dana (Viewer)
      await client.query(
        `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'viewer')`,
        [teamId, userMap['dana@newtonite.test']]
      );
    }

    // 4. Seed rich, realistic work items reflecting all operational workflow states:
    // (open, in_progress, pending_approval, resolved, closed across OPS, PAY, ENG)
    const initialItems = [
      // === OPS Team ===
      {
        teamKey: 'OPS',
        kind: 'incident',
        title: 'High latency spike on checkout API in eu-west-1',
        description: 'P99 latency surged to 4.2s following the 14:00 deployment. Investigating connection pool saturation.',
        status: 'in_progress',
        priority: 4,
        assigneeEmail: 'charlie@newtonite.test',
        requiresApproval: true,
        dueDays: 1
      },
      {
        teamKey: 'OPS',
        kind: 'incident',
        title: 'Cluster ingress controller latency degradation across eu-west-1',
        description: 'Ingress controller pod restart loop causing 502 bad gateway errors on edge routes. Needs immediate claim.',
        status: 'open',
        priority: 4,
        assigneeEmail: null,
        requiresApproval: false,
        dueDays: 1
      },
      {
        teamKey: 'OPS',
        kind: 'incident',
        title: 'Database connection pool exhaustion during peak flash sale',
        description: 'Pool saturation reached 98% with 42 clients waiting on checkout service. Scale pool size and add read replica.',
        status: 'in_progress',
        priority: 4,
        assigneeEmail: 'alice@newtonite.test',
        requiresApproval: true,
        dueDays: 2
      },
      {
        teamKey: 'OPS',
        kind: 'customer_issue',
        title: 'Enterprise customer Acme Corp unable to export audit logs',
        description: 'Export job terminates with 504 gateway timeout for date ranges exceeding 30 days. Fix pagination memory buffer.',
        status: 'pending_approval',
        priority: 3,
        assigneeEmail: 'charlie@newtonite.test',
        requiresApproval: true,
        approvalRequestedByEmail: 'charlie@newtonite.test',
        dueDays: 2
      },
      {
        teamKey: 'OPS',
        kind: 'task',
        title: 'Worker node pool CPU throttling under spike traffic',
        description: 'Node group 2 hitting CFS quota limits during morning ingest batches. Adjust burst allocations.',
        status: 'open',
        priority: 2,
        assigneeEmail: null,
        requiresApproval: false,
        dueDays: 5
      },
      {
        teamKey: 'OPS',
        kind: 'task',
        title: 'Log aggregator elasticsearch buffer high watermark',
        description: 'Buffer reached 85% capacity after weekend debug logging. Cleaned old indices and rotated snapshot.',
        status: 'resolved',
        priority: 2,
        assigneeEmail: 'alice@newtonite.test',
        requiresApproval: false,
        dueDays: 7
      },
      {
        teamKey: 'OPS',
        kind: 'task',
        title: 'Routine quarterly SSL certificate rotation for internal gateway',
        description: 'Completed automated LetsEncrypt wildcard renewal and verified cipher suites.',
        status: 'closed',
        priority: 1,
        assigneeEmail: 'bob@newtonite.test',
        requiresApproval: false,
        dueDays: -10
      },

      // === PAY Team ===
      {
        teamKey: 'PAY',
        kind: 'payment',
        title: 'Unreconciled merchant payout batch #8912',
        description: 'Discrepancy of €14,250 between bank gateway and ledger. Payout is currently held pending sign-off.',
        status: 'pending_approval',
        priority: 4,
        assigneeEmail: 'charlie@newtonite.test',
        requiresApproval: true,
        approvalRequestedByEmail: 'charlie@newtonite.test',
        dueDays: 2
      },
      {
        teamKey: 'PAY',
        kind: 'payment',
        title: 'Stripe webhook retry queue saturation on recurring billing',
        description: 'Outbound webhook queue backed up by 12,000 events due to endpoint 429 throttling. Triage needed.',
        status: 'open',
        priority: 4,
        assigneeEmail: null,
        requiresApproval: false,
        dueDays: 1
      },
      {
        teamKey: 'PAY',
        kind: 'payment',
        title: 'Manual wire transfer authorization for enterprise vendor ($250k)',
        description: 'Compliance checks passed. High-value wire transfer pending dual-lead verification.',
        status: 'pending_approval',
        priority: 4,
        assigneeEmail: 'bob@newtonite.test',
        requiresApproval: true,
        approvalRequestedByEmail: 'bob@newtonite.test',
        dueDays: 1
      },
      {
        teamKey: 'PAY',
        kind: 'payment',
        title: 'Chargeback dispute processing pipeline stalls',
        description: 'Automated dispute evidence aggregation worker halted on corrupted PDF payload. Charlie investigating.',
        status: 'in_progress',
        priority: 3,
        assigneeEmail: 'charlie@newtonite.test',
        requiresApproval: true,
        dueDays: 3
      },
      {
        teamKey: 'PAY',
        kind: 'payment',
        title: 'SEPA direct debit mandate signature validation failure',
        description: 'XML parser rejecting German IBAN formatting with spaces. Open for engineer claim.',
        status: 'open',
        priority: 2,
        assigneeEmail: null,
        requiresApproval: false,
        dueDays: 4
      },
      {
        teamKey: 'PAY',
        kind: 'task',
        title: 'Update SEPA routing table for banking partner migration',
        description: 'Scheduled maintenance task to refresh routing directory and verify BIC mappings.',
        status: 'resolved',
        priority: 2,
        assigneeEmail: 'alice@newtonite.test',
        requiresApproval: false,
        dueDays: 7
      },

      // === ENG Team ===
      {
        teamKey: 'ENG',
        kind: 'compliance',
        title: 'Q3 GDPR right-to-erasure batch execution',
        description: 'Verify anonymization of cold storage archives before final purge confirmation. Bob working on verification.',
        status: 'in_progress',
        priority: 3,
        assigneeEmail: 'bob@newtonite.test',
        requiresApproval: true,
        dueDays: -1 // Overdue for testing needs_attention!
      },
      {
        teamKey: 'ENG',
        kind: 'incident',
        title: 'Kubernetes container memory limits triggering OOM kills in worker pod 3',
        description: 'Memory ceiling exceeded during image thumbnailing pipeline. Open for claim and resource limit bump.',
        status: 'open',
        priority: 3,
        assigneeEmail: null,
        requiresApproval: false,
        dueDays: 2
      },
      {
        teamKey: 'ENG',
        kind: 'task',
        title: 'Production firewall rule change for cloud egress proxy',
        description: 'Outbound CIDR expansion for AWS GovCloud region sync. Awaiting lead signoff.',
        status: 'pending_approval',
        priority: 3,
        assigneeEmail: 'charlie@newtonite.test',
        requiresApproval: true,
        approvalRequestedByEmail: 'charlie@newtonite.test',
        dueDays: 1
      },
      {
        teamKey: 'ENG',
        kind: 'task',
        title: 'Deprecate legacy v1 metrics ingestion endpoint',
        description: 'Decommissioned v1 endpoint after ensuring zero active callers over 14-day telemetry window.',
        status: 'closed',
        priority: 1,
        assigneeEmail: 'bob@newtonite.test',
        requiresApproval: false,
        dueDays: -14
      }
    ];

    for (const item of initialItems) {
      const teamId = teamMap[item.teamKey];
      const creatorId = userMap['alice@newtonite.test'];
      const assigneeId = item.assigneeEmail ? userMap[item.assigneeEmail] : null;
      const approvalRequesterId = item.approvalRequestedByEmail ? userMap[item.approvalRequestedByEmail] : null;

      // Allocate team number atomically
      const { rows: teamRows } = await client.query(
        `UPDATE teams SET next_item_number = next_item_number + 1 WHERE id = $1 RETURNING next_item_number - 1 AS number`,
        [teamId]
      );
      const number = teamRows[0].number;

      const dueAt = new Date(Date.now() + item.dueDays * 86400 * 1000);

      const { rows: itemRows } = await client.query(
        `INSERT INTO work_items (
          team_id, number, kind, title, description, status, priority,
          assignee_id, requested_by, requires_approval, approval_requested_by,
          due_at, version, event_seq, created_by, resolved_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, 1, 1, $13, $14
        ) RETURNING id`,
        [
          teamId, number, item.kind, item.title, item.description, item.status, item.priority,
          assigneeId, creatorId, item.requiresApproval, approvalRequesterId,
          dueAt, creatorId, item.status === 'resolved' ? new Date() : null
        ]
      );

      const itemId = itemRows[0].id;

      if (assigneeId) {
        await client.query(
          `INSERT INTO work_item_assignees (work_item_id, user_id, assigned_at)
           VALUES ($1, $2, now())
           ON CONFLICT DO NOTHING`,
          [itemId, assigneeId]
        );
      }

      // Create initial 'created' event (seq=1, item_version=1)
      const { rows: eventRows } = await client.query(
        `INSERT INTO work_item_events (
          work_item_id, seq, item_version, actor_id, type, payload
        ) VALUES ($1, 1, 1, $2, 'created', $3) RETURNING id`,
        [itemId, creatorId, JSON.stringify({ title: item.title, initial_status: item.status })]
      );

      // Create outbox notification row
      await client.query(
        `INSERT INTO outbox (event_id, type, payload, status)
         VALUES ($1, 'work_item.created', $2, 'pending')`,
        [eventRows[0].id, JSON.stringify({ work_item_id: itemId, team_id: teamId })]
      );
    }

    // 5. Seed initial team messages for real-time chat
    const opsTeamId = teamMap['OPS'];
    const secTeamId = teamMap['SEC'];
    const payTeamId = teamMap['PAY'];

    const initialMessages = [
      {
        teamId: opsTeamId,
        senderId: userMap['alice@newtonite.test'],
        content: '👋 Welcome to the Operations Core channel. Shift handoff: all critical alerts are triaged.'
      },
      {
        teamId: opsTeamId,
        senderId: userMap['charlie@newtonite.test'],
        content: 'Acknowledged Alice! I am monitoring the database connection pool latency.'
      },
      {
        teamId: opsTeamId,
        senderId: userMap['alice@newtonite.test'],
        content: 'Great, ping here if any threshold breaches occur so we can coordinate.'
      },
      {
        teamId: payTeamId,
        senderId: userMap['bob@newtonite.test'],
        content: 'Payments channel active: settlement batch #4402 completed with 100% success rate.'
      },
      {
        teamId: secTeamId,
        senderId: userMap['alice@newtonite.test'],
        content: 'Security team: quarterly access audit reviews underway. Leads please review rosters.'
      }
    ];

    for (const msg of initialMessages) {
      if (msg.teamId && msg.senderId) {
        await client.query(
          `INSERT INTO team_messages (team_id, sender_id, content) VALUES ($1, $2, $3)`,
          [msg.teamId, msg.senderId, msg.content]
        );
      }
    }

    // Optional bulk data generation using generate_series (if --bulk flag passed)
    if (options.bulk) {
      logger.info('Generating bulk test items with generate_series...');
      const opsTeamId = teamMap['OPS'];
      const creatorId = userMap['alice@newtonite.test'];

      await client.query(`
        WITH generated AS (
          SELECT
            g AS idx,
            ${opsTeamId}::bigint AS team_id,
            (ARRAY['customer_issue', 'incident', 'payment', 'compliance', 'task'])[1 + (g % 5)] AS kind,
            'Generated Bulk Operational Item #' || g AS title,
            'Automated synthetic stress test record number ' || g || ' for scale verification.' AS description,
            (ARRAY['open', 'in_progress', 'resolved'])[1 + (g % 3)] AS status,
            (1 + (g % 4))::smallint AS priority,
            CASE WHEN (g % 3) = 0 THEN ${userMap['charlie@newtonite.test']}::bigint ELSE NULL END AS assignee_id,
            now() + ((g % 20) - 5) * interval '1 day' AS due_at
          FROM generate_series(1, 5000) AS g
        ),
        inserted_items AS (
          INSERT INTO work_items (
            team_id, number, kind, title, description, status, priority,
            assignee_id, requested_by, requires_approval, due_at,
            version, event_seq, created_by
          )
          SELECT
            team_id,
            100 + idx,
            kind,
            title,
            description,
            status,
            priority,
            assignee_id,
            ${creatorId},
            false,
            due_at,
            1,
            1,
            ${creatorId}
          FROM generated
          RETURNING id, title, created_by
        )
        INSERT INTO work_item_events (work_item_id, seq, item_version, actor_id, type, payload)
        SELECT id, 1, 1, created_by, 'created', jsonb_build_object('title', title)
        FROM inserted_items;
      `);

      await client.query(`UPDATE teams SET next_item_number = 5200 WHERE id = ${opsTeamId};`);
    }

    // 6. Seed sample work item attachments
    await client.query(`
      INSERT INTO work_item_attachments (work_item_id, uploader_id, filename, file_type, file_size, description)
      VALUES
        (1, 1, 'EU-Merchant-Gateway-Diagnostic-Report.pdf', 'application/pdf', 245760, 'Full error traces and gateway timeout metrics from EU edge proxies'),
        (1, 2, 'Payment-Gateway-Failover-SOP-v3.pdf', 'application/pdf', 184320, 'Standard Operating Procedure for routing failover across secondary payment providers'),
        (2, 3, 'Incident-Post-Mortem-PAY-49.pdf', 'application/pdf', 312500, 'Detailed root-cause analysis of settlement pipeline deadlock');
    `);

    // 7. Seed On-Call shifts for all teams
    await client.query(`
      INSERT INTO on_call_shifts (team_id, user_id, tier, starts_at, ends_at)
      VALUES
        (1, 1, 'primary', now() - interval '2 days', now() + interval '5 days'),
        (1, 2, 'secondary', now() - interval '2 days', now() + interval '5 days'),
        (1, 3, 'escalation', now() - interval '2 days', now() + interval '5 days'),
        (2, 2, 'primary', now() - interval '1 day', now() + interval '6 days'),
        (2, 1, 'secondary', now() - interval '1 day', now() + interval '6 days'),
        (3, 3, 'primary', now() - interval '3 days', now() + interval '4 days'),
        (3, 1, 'secondary', now() - interval '3 days', now() + interval '4 days');
    `);

    // 8. Seed active Operational Calls & War Rooms
    await client.query(`
      INSERT INTO operational_calls (team_id, creator_id, title, description, platform, meeting_url, scheduled_at, work_item_id, participants, status)
      VALUES
        (
          1,
          1,
          'Urgent War Room: EU Card Payment Failures',
          'Live triage and emergency mitigation of European payment gateway timeout rates exceeding 35%.',
          'google_meet',
          'https://meet.google.com/huv-wkqz-kpm',
          now() - interval '10 minutes',
          1,
          '[1, 2, 3]'::jsonb,
          'active'
        ),
        (
          1,
          2,
          'Daily Operational Sync & Shift Handover',
          'Review open incidents, overnight queue, and assign high-priority compliance jobs.',
          'teams',
          'https://teams.microsoft.com/l/meetup-join/operations-sync-daily-91823',
          now() + interval '2 hours',
          null,
          '[1, 2, 3, 4]'::jsonb,
          'active'
        );
    `);

    // Restore preserved custom user accounts and their workspaces
    if (customUsers.length > 0) {
      for (const u of customUsers) {
        await client.query(
          `INSERT INTO users (id, email, name, password_hash, is_org_admin, failed_logins, created_at)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, 0, $6)
           ON CONFLICT (id) DO NOTHING`,
          [u.id, u.email, u.name, u.password_hash, u.is_org_admin, u.created_at]
        );
      }
      for (const ws of customWorkspaces) {
        await client.query(
          `INSERT INTO workspaces (id, name, slug, created_by, created_at)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [ws.id, ws.name, ws.slug, ws.created_by, ws.created_at]
        );
      }
      for (const wm of customWsMemberships) {
        await client.query(
          `INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (workspace_id, user_id) DO NOTHING`,
          [wm.workspace_id, wm.user_id, wm.role, wm.created_at]
        );
      }
      for (const t of customTeams) {
        await client.query(
          `INSERT INTO teams (id, name, key, workspace_id, next_item_number, created_at)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [t.id, t.name, t.key, t.workspace_id, t.next_item_number, t.created_at]
        );
      }
      for (const tm of customTeamMemberships) {
        await client.query(
          `INSERT INTO team_memberships (team_id, user_id, role, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (team_id, user_id) DO NOTHING`,
          [tm.team_id, tm.user_id, tm.role, tm.created_at]
        );
      }

      // Synchronize identity sequences to highest IDs
      await client.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1))`);
      await client.query(`SELECT setval(pg_get_serial_sequence('workspaces', 'id'), COALESCE((SELECT MAX(id) FROM workspaces), 1))`);
      await client.query(`SELECT setval(pg_get_serial_sequence('teams', 'id'), COALESCE((SELECT MAX(id) FROM teams), 1))`);
    }

    await client.query('COMMIT');
    logger.info('Seed completed successfully!');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors if connection was severed
    }
    if (err.code === '40P01' && attempts > 1) {
      logger.warn('Deadlock detected during seedDatabase, retrying in 250ms...');
      if (!released) {
        released = true;
        client.release();
      }
      await new Promise((r) => setTimeout(r, 250));
      return seedDatabase(options, attempts - 1);
    }
    logger.error({ err }, 'Seed failed, rolled back');
    throw err;
  } finally {
    if (!released) {
      released = true;
      client.release();
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const isBulk = process.argv.includes('--bulk');
  seedDatabase({ bulk: isBulk })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
