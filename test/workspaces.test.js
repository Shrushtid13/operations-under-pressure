// test/workspaces.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { getTestApp } from './testHelper.js';

let app;

async function req(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    'content-type': 'application/json',
    'x-requested-by': 'test-runner',
    'origin': 'http://localhost:5173',
    ...(options.headers || {})
  };
  const payload = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined;

  const res = await app.inject({
    method,
    url: path,
    headers,
    payload
  });

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    data = null;
  }

  return {
    status: res.statusCode,
    headers: {
      get: (h) => {
        if (h.toLowerCase() === 'set-cookie') {
          const cookie = (res.cookies || []).find((c) => c.name === 'session_token');
          return cookie ? `session_token=${cookie.value}` : null;
        }
        return res.headers[h.toLowerCase()];
      }
    },
    data
  };
}

describe('Multi-tenant Workspaces & Invitations System', () => {
  beforeAll(async () => {
    app = await getTestApp();
  });
  const acmeOwnerEmail = `acme-owner-${Date.now()}@example.com`;
  const acmeMemberEmail = `acme-member-${Date.now()}@example.com`;
  let acmeOwnerCookie = '';
  let acmeMemberCookie = '';
  let acmeTeamId = null;
  let acmeInviteCode = null;
  let acmeItemId = null;

  it('1. Signs up an owner with a new private workspace (Acme Corp)', async () => {
    const res = await req('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: acmeOwnerEmail,
        name: 'Wile E. Coyote',
        password: 'Password123!',
        role: 'lead',
        workspace_name: 'Acme Corporation'
      })
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.user.email).toBe(acmeOwnerEmail);
    expect(res.data.user.workspaces).toBeDefined();
    expect(res.data.user.workspaces.length).toBe(1);
    expect(res.data.user.workspaces[0].name).toBe('Acme Corporation');
    expect(res.data.user.workspaces[0].role).toBe('owner');

    const cookie = res.headers.get('set-cookie');
    expect(cookie).toBeTruthy();
    acmeOwnerCookie = cookie.split(';')[0];

    // Check GET /me
    const meRes = await req('/auth/me', {
      headers: { cookie: acmeOwnerCookie }
    });
    expect(meRes.status).toBe(200);
    expect(meRes.data.user.teams.length).toBe(1);
    expect(meRes.data.user.teams[0].name).toContain('Acme Corporation');
    acmeTeamId = meRes.data.user.teams[0].id;
  });

  it('2. Multi-tenant privacy: Acme owner cannot see Newtonite items (team 1)', async () => {
    // Attempt to list items in Team 1 (Newtonite)
    const res = await req('/work-items?team=1', {
      headers: { cookie: acmeOwnerCookie }
    });
    // Should be forbidden or return empty/404 because user is not a member of team 1
    if (res.status === 200) {
      expect(res.data.items.length).toBe(0);
    } else {
      expect([401, 403, 404]).toContain(res.status);
    }
  });

  it('3. Acme owner can create an item in Acme team', async () => {
    const res = await req(`/teams/${acmeTeamId}/work-items`, {
      method: 'POST',
      headers: {
        cookie: acmeOwnerCookie,
        'idempotency-key': crypto.randomUUID()
      },
      body: JSON.stringify({
        kind: 'incident',
        title: 'Acme High Voltage Incident',
        description: 'Capacitor exploded in warehouse B',
        priority: 2
      })
    });

    expect(res.status).toBe(201);
    expect(res.data.title).toBe('Acme High Voltage Incident');
    acmeItemId = res.data.id;
  });

  it('4. Acme owner generates an invitation code for Acme team', async () => {
    // Get workspace ID
    const meRes = await req('/auth/me', {
      headers: { cookie: acmeOwnerCookie }
    });
    const wsId = meRes.data.user.workspaces[0].id;

    const res = await req(`/workspaces/${wsId}/invitations`, {
      method: 'POST',
      headers: { cookie: acmeOwnerCookie },
      body: JSON.stringify({
        role: 'member',
        team_id: acmeTeamId
      })
    });

    expect(res.status).toBe(201);
    expect(res.data.code).toMatch(/^INV-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.data.role).toBe('member');
    acmeInviteCode = res.data.code;
  });

  it('5. New teammate registers using the invitation code', async () => {
    const res = await req('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: acmeMemberEmail,
        name: 'Road Runner',
        password: 'Password123!',
        invite_code: acmeInviteCode
      })
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.user.email).toBe(acmeMemberEmail);

    const cookie = res.headers.get('set-cookie');
    acmeMemberCookie = cookie.split(';')[0];

    // Check GET /me for new teammate
    const meRes = await req('/auth/me', {
      headers: { cookie: acmeMemberCookie }
    });
    expect(meRes.status).toBe(200);
    expect(meRes.data.user.teams.length).toBe(1);
    expect(meRes.data.user.teams[0].id).toBe(acmeTeamId);
    expect(meRes.data.user.teams[0].role).toBe('member');
    expect(meRes.data.user.workspaces[0].name).toBe('Acme Corporation');
  });

  it('6. Teammate can see Acme items, but cannot see Newtonite items', async () => {
    // Teammate lists Acme items
    const acmeItemsRes = await req(`/work-items?team=${acmeTeamId}`, {
      headers: { cookie: acmeMemberCookie }
    });
    expect(acmeItemsRes.status).toBe(200);
    expect(acmeItemsRes.data.items.some((i) => i.id === acmeItemId)).toBe(true);

    // Teammate tries to access Newtonite team 1
    const newtoniteRes = await req('/work-items?team=1', {
      headers: { cookie: acmeMemberCookie }
    });
    if (newtoniteRes.status === 200) {
      expect(newtoniteRes.data.items.length).toBe(0);
    } else {
      expect([401, 403, 404]).toContain(newtoniteRes.status);
    }
  });

  it('7. Reusable DEMO-NEWTONITE code allows exploration without breaking single-use rules', async () => {
    const explorerEmail = `demo-explorer-${Date.now()}@example.com`;
    const regRes = await req('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: explorerEmail,
        name: 'Curious Explorer',
        password: 'Password123!'
      })
    });
    expect([200, 201]).toContain(regRes.status);
    const explorerCookie = regRes.headers.get('set-cookie').split(';')[0];

    // User starts with 0 teams / workspaces
    const initialMe = await req('/auth/me', { headers: { cookie: explorerCookie } });
    expect(initialMe.data.user.teams.length).toBe(0);

    // Joins DEMO-NEWTONITE
    const joinRes = await req('/workspaces/join', {
      method: 'POST',
      headers: { cookie: explorerCookie },
      body: JSON.stringify({ code: 'DEMO-NEWTONITE' })
    });
    expect(joinRes.status).toBe(200);

    // Now belongs to Newtonite workspace
    const joinedMe = await req('/auth/me', { headers: { cookie: explorerCookie } });
    expect(joinedMe.data.user.teams.length).toBeGreaterThan(0);
    expect(String(joinedMe.data.user.workspaces[0].id)).toBe('1');
  });
});
