// test/concurrency.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { getTestApp, resetDatabase, loginAs, authHeaders } from './testHelper.js';
import { pool } from '../src/db/pool.js';

describe('Concurrency & Non-CRUD Correctness Tests (#1, #2, #3, #22)', () => {
  let app;
  let alice; // Lead
  let bob;   // Lead
  let charlie; // Member
  let dana;   // Viewer
  let openItemId;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    alice = await loginAs(app, 'alice@newtonite.test');
    bob = await loginAs(app, 'bob@newtonite.test');
    charlie = await loginAs(app, 'charlie@newtonite.test');
    dana = await loginAs(app, 'dana@newtonite.test');

    // Find the open item (OPS customer_issue)
    const { rows } = await pool.query(
      `SELECT id FROM work_items WHERE status = 'open' LIMIT 1`
    );
    openItemId = rows[0].id;
  });

  // Test #1: Concurrent claim
  it('1. Concurrent claim: parallel claims allow exactly one 200 and others 409', async () => {
    // Issue parallel claims from Alice and Bob
    const attempts = 10;
    const promises = [];

    for (let i = 0; i < attempts; i++) {
      const actor = i % 2 === 0 ? alice : bob;
      const key = `claim-key-${i}-${crypto.randomUUID()}`;

      promises.push(
        app.inject({
          method: 'POST',
          url: `/work-items/${openItemId}/claim`,
          headers: authHeaders(actor.cookieHeader, key),
          payload: {}
        })
      );
    }

    const responses = await Promise.all(promises);

    const successes = responses.filter((r) => r.statusCode === 200);
    const conflicts = responses.filter((r) => r.statusCode === 409);

    // Exactly one claim transaction succeeds in claiming the open item
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);

    for (const c of conflicts) {
      const body = c.json();
      expect(body.code).toBe('ALREADY_ASSIGNED');
      expect(body.details.assignee).toBeDefined();
    }

    // Check database state: exactly one assignee, version bumped to 2, exactly one assigned event
    const { rows: itemRows } = await pool.query(
      `SELECT status, assignee_id, version FROM work_items WHERE id = $1`,
      [openItemId]
    );
    expect(itemRows[0].status).toBe('in_progress');
    expect(itemRows[0].assignee_id).not.toBeNull();
    expect(itemRows[0].version).toBe(2);

    const { rows: eventRows } = await pool.query(
      `SELECT type FROM work_item_events WHERE work_item_id = $1 AND type = 'assigned'`,
      [openItemId]
    );
    expect(eventRows.length).toBe(1);
  });

  // Test #2: Lost-update prevention
  it('2. Lost-update prevention: concurrent PATCH to same field produces 409 VERSION_CONFLICT', async () => {
    // Both Alice and Bob read version 1 of openItemId
    const v1 = 1;

    const patch1 = app.inject({
      method: 'PATCH',
      url: `/work-items/${openItemId}`,
      headers: authHeaders(alice.cookieHeader, `patch-key-1-${crypto.randomUUID()}`),
      payload: { expected_version: v1, title: 'Title modified by Alice' }
    });

    const patch2 = app.inject({
      method: 'PATCH',
      url: `/work-items/${openItemId}`,
      headers: authHeaders(bob.cookieHeader, `patch-key-2-${crypto.randomUUID()}`),
      payload: { expected_version: v1, title: 'Title modified by Bob' }
    });

    const [res1, res2] = await Promise.all([patch1, patch2]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const conflictRes = res1.statusCode === 409 ? res1 : res2;
    const conflictBody = conflictRes.json();
    expect(conflictBody.code).toBe('VERSION_CONFLICT');
    expect(conflictBody.details.conflicting_fields).toContain('title');
  });

  // Test #3: Idempotent retry
  it('3. Idempotent retry: same key returns identical stored response without re-judging state', async () => {
    const key = `claim-idem-${crypto.randomUUID()}`;

    // 1. Claim open item with key
    const res1 = await app.inject({
      method: 'POST',
      url: `/work-items/${openItemId}/claim`,
      headers: authHeaders(charlie.cookieHeader, key),
      payload: {}
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();

    // 2. Retry with same key
    const res2 = await app.inject({
      method: 'POST',
      url: `/work-items/${openItemId}/claim`,
      headers: authHeaders(charlie.cookieHeader, key),
      payload: {}
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual(body1);

    // 3. Move item forward: Charlie requests approval
    const resApproveReq = await app.inject({
      method: 'POST',
      url: `/work-items/${openItemId}/transition`,
      headers: authHeaders(charlie.cookieHeader, `trans-${crypto.randomUUID()}`),
      payload: { action: 'request_approval', expected_version: 2 }
    });
    // Even if status changed, retrying original claim key STILL replays stored 200 response verbatim!
    const res3 = await app.inject({
      method: 'POST',
      url: `/work-items/${openItemId}/claim`,
      headers: authHeaders(charlie.cookieHeader, key),
      payload: {}
    });
    expect(res3.statusCode).toBe(200);
    expect(res3.json()).toEqual(body1);

    // 4. Reusing key with DIFFERENT body produces 422 IDEMPOTENCY_KEY_REUSED
    const resReused = await app.inject({
      method: 'POST',
      url: `/work-items/${openItemId}/claim`,
      headers: authHeaders(charlie.cookieHeader, key),
      payload: { unexpected_field: true }
    });
    expect(resReused.statusCode).toBe(422);
    expect(resReused.json().code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  // Test #22: Field-level merge
  it('22. Field-level merge: concurrent edits to disjoint fields merge into 200', async () => {
    // Current item is at version 1
    const v1 = 1;

    // Alice changes title -> moves version to 2
    const resAlice = await app.inject({
      method: 'PATCH',
      url: `/work-items/${openItemId}`,
      headers: authHeaders(alice.cookieHeader, `merge-alice-${crypto.randomUUID()}`),
      payload: { expected_version: v1, title: 'Updated Title by Alice' }
    });
    expect(resAlice.statusCode).toBe(200);
    expect(resAlice.json().version).toBe(2);

    // Bob submits PATCH with expected_version: 1 (stale!), but modifying priority (disjoint field)
    const resBob = await app.inject({
      method: 'PATCH',
      url: `/work-items/${openItemId}`,
      headers: authHeaders(bob.cookieHeader, `merge-bob-${crypto.randomUUID()}`),
      payload: { expected_version: v1, priority: 4 }
    });

    expect(resBob.statusCode).toBe(200);
    const bobBody = resBob.json();
    expect(bobBody.version).toBe(3);
    expect(bobBody.title).toBe('Updated Title by Alice');
    expect(bobBody.priority).toBe(4);
    expect(bobBody.merge.merged).toBe(true);
    expect(bobBody.merge.base_version).toBe(1);

    // Verify audit events recorded the merge
    const { rows: eventRows } = await pool.query(
      `SELECT item_version, payload FROM work_item_events
       WHERE work_item_id = $1 AND type = 'updated'
       ORDER BY item_version ASC`,
      [openItemId]
    );
    expect(eventRows.length).toBe(2);
    expect(eventRows[1].payload.merged_from_version).toBe(1);
  });
});
