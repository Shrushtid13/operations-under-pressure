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

export async function seedDatabase(options = { bulk: false }) {
  if (config.isProduction) {
    throw new Error('Refusing to seed database when NODE_ENV is production');
  }

  logger.info('Seeding database...');
  const client = await migratorPool.connect();

  try {
    await client.query('BEGIN');

    // Clean existing data for clean seed
    await client.query(`
      TRUNCATE TABLE 
        notifications,
        outbox,
        idempotency_keys,
        work_item_events,
        work_items,
        membership_events,
        team_memberships,
        teams,
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

    // 2. Seed Teams (Each team key matches candidate brief categories)
    const teamsData = [
      { name: 'Operations & Incidents', key: 'OPS' },
      { name: 'Payments & Settlement', key: 'PAY' },
      { name: 'Platform Engineering', key: 'ENG' }
    ];

    const teamMap = {};
    for (const t of teamsData) {
      const { rows } = await client.query(
        `INSERT INTO teams (name, key)
         VALUES ($1, $2)
         RETURNING id, key`,
        [t.name, t.key]
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

    // 4. Seed initial realistic work items reflecting the candidate brief:
    // (Customer issue, incident, payment, compliance, task requiring approval)
    const initialItems = [
      {
        teamKey: 'OPS',
        kind: 'incident',
        title: 'High latency spike on checkout API in eu-west-1',
        description: 'P99 latency surged to 4.2s following the 14:00 deployment. Investigating connection pool saturation.',
        status: 'in_progress',
        priority: 4,
        assigneeEmail: 'charlie@newtonite.test',
        requiresApproval: false,
        dueDays: 1
      },
      {
        teamKey: 'PAY',
        kind: 'payment',
        title: 'Unreconciled merchant payout batch #8912',
        description: 'Discrepancy of €14,250 between bank gateway and ledger. Payout is currently held pending sign-off.',
        status: 'pending_approval',
        priority: 3,
        assigneeEmail: 'charlie@newtonite.test',
        requiresApproval: true,
        approvalRequestedByEmail: 'charlie@newtonite.test',
        dueDays: 2
      },
      {
        teamKey: 'OPS',
        kind: 'customer_issue',
        title: 'Enterprise customer Acme Corp unable to export audit logs',
        description: 'Export job terminates with 504 gateway timeout for date ranges exceeding 30 days.',
        status: 'open',
        priority: 2,
        assigneeEmail: null,
        requiresApproval: false,
        dueDays: 5
      },
      {
        teamKey: 'ENG',
        kind: 'compliance',
        title: 'Q3 GDPR right-to-erasure batch execution',
        description: 'Verify anonymization of cold storage archives before final purge confirmation.',
        status: 'in_progress',
        priority: 3,
        assigneeEmail: 'bob@newtonite.test',
        requiresApproval: true,
        dueDays: -1 // Overdue for testing needs_attention!
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

    await client.query('COMMIT');
    logger.info('Seed completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Seed failed, rolled back');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const isBulk = process.argv.includes('--bulk');
  seedDatabase({ bulk: isBulk })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
