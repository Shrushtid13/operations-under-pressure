// web/src/api.js

export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function fetchApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'x-requested-by': 'web-console',
    ...(options.headers || {})
  };

  const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
  if (isMutating) {
    headers['content-type'] = 'application/json';
    if (!headers['idempotency-key'] && !path.startsWith('/auth') && !path.includes('/read')) {
      headers['idempotency-key'] = crypto.randomUUID();
    }
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
  });

  if (res.status === 204 || res.status === 304) {
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const code = data?.code || 'UNKNOWN_ERROR';
    const message = data?.message || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, code, message, data?.details);
  }

  return data;
}

// Auth API
export const api = {
  login: (email, password) => fetchApi('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => fetchApi('/auth/logout', { method: 'POST' }),
  getMe: () => fetchApi('/auth/me'),
  changePassword: (current_password, new_password) =>
    fetchApi('/auth/password', { method: 'POST', body: { current_password, new_password } }),

  // Overview
  getOverviewSummary: () => fetchApi('/overview/summary'),

  // Work Items
  listWorkItems: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        qs.set(k, v);
      }
    }
    const queryStr = qs.toString();
    return fetchApi(`/work-items${queryStr ? `?${queryStr}` : ''}`);
  },

  getWorkItem: (id) => fetchApi(`/work-items/${id}`),

  createWorkItem: (teamId, data, key) =>
    fetchApi(`/teams/${teamId}/work-items`, {
      method: 'POST',
      headers: key ? { 'idempotency-key': key } : {},
      body: data
    }),

  patchWorkItem: (id, expectedVersion, fields, key) =>
    fetchApi(`/work-items/${id}`, {
      method: 'PATCH',
      headers: key ? { 'idempotency-key': key } : {},
      body: { expected_version: expectedVersion, ...fields }
    }),

  claimWorkItem: (id, key) =>
    fetchApi(`/work-items/${id}/claim`, {
      method: 'POST',
      headers: key ? { 'idempotency-key': key } : {},
      body: {}
    }),

  releaseWorkItem: (id, expectedVersion, key) =>
    fetchApi(`/work-items/${id}/release`, {
      method: 'POST',
      headers: key ? { 'idempotency-key': key } : {},
      body: { expected_version: expectedVersion }
    }),

  assignWorkItem: (id, assigneeId, expectedVersion, reason, key) =>
    fetchApi(`/work-items/${id}/assign`, {
      method: 'POST',
      headers: key ? { 'idempotency-key': key } : {},
      body: { assignee_id: assigneeId, expected_version: expectedVersion, reason }
    }),

  transitionWorkItem: (id, action, expectedVersion, reason, key) =>
    fetchApi(`/work-items/${id}/transition`, {
      method: 'POST',
      headers: key ? { 'idempotency-key': key } : {},
      body: { action, expected_version: expectedVersion, reason }
    }),

  addComment: (id, text, key) =>
    fetchApi(`/work-items/${id}/comments`, {
      method: 'POST',
      headers: key ? { 'idempotency-key': key } : {},
      body: { text }
    }),

  listEvents: (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchApi(`/work-items/${id}/events${qs ? `?${qs}` : ''}`);
  },

  // Notifications
  listNotifications: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchApi(`/notifications${qs ? `?${qs}` : ''}`);
  },

  markNotificationRead: (id) =>
    fetchApi(`/notifications/${id}/read`, { method: 'POST' }),

  // Memberships
  listTeamMembers: (teamId) => fetchApi(`/teams/${teamId}/members`),

  addTeamMember: (teamId, email, role, key) =>
    fetchApi(`/teams/${teamId}/members`, {
      method: 'POST',
      headers: key ? { 'idempotency-key': key } : {},
      body: { email, role }
    }),

  updateTeamMemberRole: (teamId, userId, role, key) =>
    fetchApi(`/teams/${teamId}/members/${userId}`, {
      method: 'PATCH',
      headers: key ? { 'idempotency-key': key } : {},
      body: { role }
    }),

  removeTeamMember: (teamId, userId, key) =>
    fetchApi(`/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
      headers: key ? { 'idempotency-key': key } : {}
    })
};
