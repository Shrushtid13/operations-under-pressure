// test/api.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { getTestApp, resetDatabase, loginAs, authHeaders } from './testHelper.js';
import { pool } from '../src/db/pool.js';

describe('Workflow, Security, Audit & Invariants Tests', () => {
  let app;
  let alice;  // Lead (OPS, PAY, ENG)
  let bob;    // Lead (OPS, PAY, ENG)
  let charlie;// Member (OPS, PAY, ENG)
  let dana;   // Viewer (OPS, PAY, ENG)
  let admin;  // Org Admin (no team membership)

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    alice = await loginAs(app, 'alice@newtonite.test');
    bob = await loginAs(app, 'bob@newtonite.test');
    charlie = await loginAs(app, 'charlie@newtonite.test');
    dana = await loginAs(app, 'dana@newtonite.test');
    admin = await loginAs(app, 'admin@newtonite.test');
  });

  // Test #5 & S10: Approval Separation of Duties
  it('5 & S10. Separation of duties: requester cannot approve their own request', async () => {
    // Find an item requiring approval in PAY team
    const { rows } = await pool.query(
      `SELECT id, version, approval_requested_by FROM work_items
       WHERE status = 'pending_approval' AND requires_approval = true LIMIT 1`
    );
    const item = rows[0];
    expect(item).toBeDefined();

    // The approval was requested by Charlie (user ID 3)
    // Alice (lead) attempts approval -> succeeds!
    const resAlice = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/transition`,
      headers: authHeaders(alice.cookieHeader, `approve-${crypto.randomUUID()}`),
      payload: { action: 'approve', expected_version: item.version, reason: 'Reviewed and verified.' }
    });
    expect(resAlice.statusCode).toBe(200);
    expect(resAlice.json().fix_approved).toBe(true);
    expect(resAlice.json().status).toBe('in_progress');

    // Non-assignee (even lead) cannot resolve; only current assignee can resolve
    const resAliceResolve = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/transition`,
      headers: authHeaders(alice.cookieHeader, `resolve-${crypto.randomUUID()}`),
      payload: { action: 'resolve', expected_version: resAlice.json().version }
    });
    expect(resAliceResolve.statusCode).toBe(403);

    // Charlie (the current assignee) marks the approved fix resolved
    const resCharlieResolve = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/transition`,
      headers: authHeaders(charlie.cookieHeader, `resolve-${crypto.randomUUID()}`),
      payload: { action: 'resolve', expected_version: resAlice.json().version }
    });
    expect(resCharlieResolve.statusCode).toBe(200);
    expect(resCharlieResolve.json().status).toBe('resolved');

    // Reset and test self-approval rejection:
    // Have Bob request approval on another item, then attempt to approve it himself
    const { rows: itemRows2 } = await pool.query(
      `SELECT id, version FROM work_items WHERE status = 'in_progress' AND requires_approval = true LIMIT 1`
    );
    const item2 = itemRows2[0];

    // Reassign to Bob so Bob is assignee
    await pool.query(`UPDATE work_items SET assignee_id = $1 WHERE id = $2`, [bob.user.id, item2.id]);

    const resReq = await app.inject({
      method: 'POST',
      url: `/work-items/${item2.id}/transition`,
      headers: authHeaders(bob.cookieHeader, `req-${crypto.randomUUID()}`),
      payload: { action: 'request_approval', expected_version: item2.version }
    });
    expect(resReq.statusCode).toBe(200);

    // Bob tries to approve his own request -> 422 APPROVER_MUST_DIFFER
    const resSelfApprove = await app.inject({
      method: 'POST',
      url: `/work-items/${item2.id}/transition`,
      headers: authHeaders(bob.cookieHeader, `self-app-${crypto.randomUUID()}`),
      payload: { action: 'approve', expected_version: resReq.json().version }
    });
    expect(resSelfApprove.statusCode).toBe(422);
    expect(resSelfApprove.json().code).toBe('APPROVER_MUST_DIFFER');
  });

  // Test #4 & S6, S9: Resource-level authorization
  it('4 & S6, S9. Resource-level authorization: Viewer denied write, Org Admin denied write on non-member team', async () => {
    const { rows } = await pool.query(`SELECT id, version FROM work_items WHERE status = 'open' LIMIT 1`);
    const openItem = rows[0];

    // Dana (Viewer) attempts claim -> 403 FORBIDDEN
    const resDana = await app.inject({
      method: 'POST',
      url: `/work-items/${openItem.id}/claim`,
      headers: authHeaders(dana.cookieHeader, `dana-claim-${crypto.randomUUID()}`),
      payload: {}
    });
    expect(resDana.statusCode).toBe(403);

    // Org Admin (Admin) can read
    const resAdminRead = await app.inject({
      method: 'GET',
      url: `/work-items/${openItem.id}`,
      headers: authHeaders(admin.cookieHeader)
    });
    expect(resAdminRead.statusCode).toBe(200);

    // Org Admin attempting mutation gets 403 FORBIDDEN
    const resAdminWrite = await app.inject({
      method: 'POST',
      url: `/work-items/${openItem.id}/claim`,
      headers: authHeaders(admin.cookieHeader, `admin-claim-${crypto.randomUUID()}`),
      payload: {}
    });
    expect(resAdminWrite.statusCode).toBe(403);
  });

  // Test #6 & #13: Audit completeness & Full-History Invariant Query
  it('6 & 13. Audit completeness: Full-history invariant returns 0 rows', async () => {
    // Perform comments and state changes
    const { rows } = await pool.query(`SELECT id, version FROM work_items WHERE status = 'open' LIMIT 1`);
    const item = rows[0];

    // Charlie adds comment
    const resComment = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/comments`,
      headers: authHeaders(charlie.cookieHeader, `comment-${crypto.randomUUID()}`),
      payload: { text: 'Starting investigation into root cause.' }
    });
    expect(resComment.statusCode).toBe(201);

    // Comments must NOT bump version
    const { rows: itemAfterComment } = await pool.query(`SELECT version, event_seq FROM work_items WHERE id = $1`, [item.id]);
    expect(itemAfterComment[0].version).toBe(item.version);
    expect(itemAfterComment[0].event_seq).toBe(2);

    // Charlie claims item
    const resClaim = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/claim`,
      headers: authHeaders(charlie.cookieHeader, `claim-${crypto.randomUUID()}`),
      payload: {}
    });
    expect(resClaim.statusCode).toBe(200);

    // Run the Full-History Invariant SQL from §4 across ALL work items in database
    const invariantSql = `
      SELECT w.id
      FROM work_items w
      CROSS JOIN LATERAL (
        SELECT count(item_version)          AS state_events,
               count(DISTINCT item_version) AS distinct_versions,
               min(item_version)            AS min_version,
               max(item_version)            AS max_version,
               count(*)                     AS all_events,
               min(seq)                     AS min_seq,
               max(seq)                     AS max_seq
        FROM work_item_events e WHERE e.work_item_id = w.id
      ) x
      WHERE x.state_events      IS DISTINCT FROM w.version
         OR x.distinct_versions IS DISTINCT FROM w.version
         OR x.min_version       IS DISTINCT FROM 1
         OR x.max_version       IS DISTINCT FROM w.version
         OR x.all_events        IS DISTINCT FROM w.event_seq
         OR x.min_seq           IS DISTINCT FROM 1
         OR x.max_seq           IS DISTINCT FROM w.event_seq;
    `;

    const { rows: invariantViolations } = await pool.query(invariantSql);
    expect(invariantViolations).toHaveLength(0);
  });

  // Test #17 & S17: Immutability triggers and DB permission limits
  it('17 & S17. Immutability trigger and permissions prevent UPDATE/DELETE on audit event tables', async () => {
    const { rows } = await pool.query(`SELECT id FROM work_item_events LIMIT 1`);
    const eventId = rows[0].id;

    // 1. As app_runtime: UPDATE/DELETE denied by SQL privileges
    await expect(
      pool.query(`UPDATE work_item_events SET payload = '{}' WHERE id = $1`, [eventId])
    ).rejects.toThrow(/permission denied/i);

    await expect(
      pool.query(`DELETE FROM work_item_events WHERE id = $1`, [eventId])
    ).rejects.toThrow(/permission denied/i);

    // 2. As table owner (migratorPool): UPDATE/DELETE blocked by immutability trigger
    const { migratorPool } = await import('../src/db/pool.js');
    await expect(
      migratorPool.query(`UPDATE work_item_events SET payload = '{}' WHERE id = $1`, [eventId])
    ).rejects.toThrow(/append-only/i);

    await expect(
      migratorPool.query(`DELETE FROM work_item_events WHERE id = $1`, [eventId])
    ).rejects.toThrow(/append-only/i);
  });

  // Test #20: Membership management & active work item guards
  it('20. Membership guards: cannot remove or demote member holding active work items', async () => {
    // Charlie holds an active item in PAY team
    const { rows: charlieItems } = await pool.query(
      `SELECT team_id FROM work_items WHERE assignee_id = $1 AND status IN ('in_progress', 'pending_approval') LIMIT 1`,
      [charlie.user.id]
    );
    expect(charlieItems.length).toBeGreaterThan(0);
    const teamId = charlieItems[0].team_id;

    // Alice (Lead) attempts to demote Charlie to viewer -> 409 MEMBER_HAS_ACTIVE_ITEMS
    const resDemote = await app.inject({
      method: 'PATCH',
      url: `/teams/${teamId}/members/${charlie.user.id}`,
      headers: authHeaders(alice.cookieHeader, `demote-${crypto.randomUUID()}`),
      payload: { role: 'viewer' }
    });
    expect(resDemote.statusCode).toBe(409);
    expect(resDemote.json().code).toBe('MEMBER_HAS_ACTIVE_ITEMS');

    // Alice attempts to soft-remove Charlie -> 409 MEMBER_HAS_ACTIVE_ITEMS
    const resRemove = await app.inject({
      method: 'DELETE',
      url: `/teams/${teamId}/members/${charlie.user.id}`,
      headers: authHeaders(alice.cookieHeader, `remove-${crypto.randomUUID()}`),
      payload: {}
    });
    expect(resRemove.statusCode).toBe(409);
    expect(resRemove.json().code).toBe('MEMBER_HAS_ACTIVE_ITEMS');
  });

  // Test #21: Multiple assignees on one job & co-assignee resolution
  it('21. Multiple assignees: lead can assign 2+ people, co-assignee can submit fix and resolve after approval', async () => {
    // 1. Create a work item in OPS team
    const opsTeamRes = await pool.query(`SELECT id FROM teams WHERE key = 'OPS'`);
    const opsTeamId = opsTeamRes.rows[0].id;

    const resCreate = await app.inject({
      method: 'POST',
      url: `/teams/${opsTeamId}/work-items`,
      headers: authHeaders(alice.cookieHeader, `co-create-${crypto.randomUUID()}`),
      payload: {
        title: 'Collaborative penetration testing',
        kind: 'incident',
        priority: 3
      }
    });
    expect(resCreate.statusCode).toBe(201);
    const item = resCreate.json();

    // 2. Alice (Lead) assigns two people (Charlie and Bob) at once
    const resCoAssign = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/assignees`,
      headers: authHeaders(alice.cookieHeader, `co-assign-${crypto.randomUUID()}`),
      payload: {
        user_ids: [charlie.user.id, bob.user.id]
      }
    });
    expect(resCoAssign.statusCode).toBe(200);

    // 3. Detail includes both assignees
    const resDetail = await app.inject({
      method: 'GET',
      url: `/work-items/${item.id}`,
      headers: authHeaders(alice.cookieHeader)
    });
    expect(resDetail.statusCode).toBe(200);
    const detail = resDetail.json();
    expect(detail.assignees.length).toBe(2);
    const assigneeIds = detail.assignees.map((a) => String(a.id));
    expect(assigneeIds).toContain(String(charlie.user.id));
    expect(assigneeIds).toContain(String(bob.user.id));
    expect(detail.status).toBe('in_progress');

    // 4. Bob (co-assignee) submits fix for approval
    const resReq = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/transition`,
      headers: authHeaders(bob.cookieHeader, `bob-req-${crypto.randomUUID()}`),
      payload: {
        action: 'request_approval',
        expected_version: detail.version,
        reason: 'Patched SSL cert and verified'
      }
    });
    expect(resReq.statusCode).toBe(200);
    expect(resReq.json().status).toBe('pending_approval');

    // 5. Alice (Lead) approves fix -> status returns to in_progress with fix_approved = true
    const resApprove = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/transition`,
      headers: authHeaders(alice.cookieHeader, `alice-appr-${crypto.randomUUID()}`),
      payload: {
        action: 'approve',
        expected_version: resReq.json().version
      }
    });
    expect(resApprove.statusCode).toBe(200);
    expect(resApprove.json().fix_approved).toBe(true);
    expect(resApprove.json().status).toBe('in_progress');

    // 6. Alice (Lead, non-assignee) CANNOT mark as resolved (only assignees can resolve!)
    const resAliceResolve = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/transition`,
      headers: authHeaders(alice.cookieHeader, `alice-res-${crypto.randomUUID()}`),
      payload: {
        action: 'resolve',
        expected_version: resApprove.json().version
      }
    });
    expect(resAliceResolve.statusCode).toBe(403);

    // 7. Charlie (co-assignee) CAN mark as resolved
    const resCharlieResolve = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/transition`,
      headers: authHeaders(charlie.cookieHeader, `charlie-res-${crypto.randomUUID()}`),
      payload: {
        action: 'resolve',
        expected_version: resApprove.json().version
      }
    });
    expect(resCharlieResolve.statusCode).toBe(200);
    expect(resCharlieResolve.json().status).toBe('resolved');
  });
});
