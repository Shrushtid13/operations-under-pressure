// test/testHelper.js
import { buildApp } from '../src/api/server.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/db/pool.js';

let appInstance = null;

export async function getTestApp() {
  if (!appInstance) {
    appInstance = await buildApp();
    await appInstance.ready();
  }
  return appInstance;
}

export async function resetDatabase() {
  await seedDatabase({ bulk: false });
}

export async function loginAs(app, email, password = 'Password123!') {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: {
      'content-type': 'application/json',
      'x-requested-by': 'test-runner',
      'origin': 'http://localhost:5173'
    },
    payload: { email, password }
  });

  if (res.statusCode !== 200) {
    throw new Error(`Login failed for ${email} with status ${res.statusCode}: ${res.body}`);
  }

  const cookies = res.cookies;
  const sessionCookie = cookies.find((c) => c.name === 'session_token');
  const token = sessionCookie ? sessionCookie.value : null;

  return {
    user: res.json().user,
    token,
    cookieHeader: `session_token=${token}`
  };
}

export function authHeaders(cookieHeader, idempotencyKey = null) {
  const headers = {
    'content-type': 'application/json',
    'x-requested-by': 'test-runner',
    'origin': 'http://localhost:5173',
    'cookie': cookieHeader
  };
  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
  }
  return headers;
}
