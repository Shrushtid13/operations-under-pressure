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

/**
 * Fetch wrapper adhering to backend contracts:
 * - credentials: 'include'
 * - X-Requested-By: 'web-console'
 * - Content-Type: 'application/json' on mutating requests
 * - Idempotency-Key support: callers can pass their own managed key; if not provided, generated per intent.
 */
export async function fetchApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'x-requested-by': 'web-console',
    ...(options.headers || {})
  };

  const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
  if (isMutating) {
    headers['content-type'] = 'application/json';
    // If mutating and no idempotency-key provided, create one if not auth/read
    if (!headers['idempotency-key'] && !path.startsWith('/auth') && !path.includes('/read')) {
      headers['idempotency-key'] = crypto.randomUUID();
    }
  }

  let res;
  try {
    const requestBody = options.body !== undefined
      ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      : (isMutating ? '{}' : undefined);

    res = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      body: requestBody
    });
  } catch (err) {
    // Network error: surface status 0 / NETWORK_ERROR so UI can show retry state and NEVER log out
    throw new ApiError(0, 'NETWORK_ERROR', err.message || 'Network connection failed');
  }

  if (res.status === 204) {
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const code = data?.code || (res.status === 401 ? 'UNAUTHORIZED' : res.status === 403 ? 'FORBIDDEN' : 'UNKNOWN_ERROR');
    const message = data?.message || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, code, message, data?.details);
  }

  return data;
}

export const api = {
  // 1. Auth & Session
  login: (email, password) => fetchApi('/auth/login', { method: 'POST', body: { email, password } }),
  register: (email, name, password, options = {}) =>
    fetchApi('/auth/register', {
      method: 'POST',
      body: typeof options === 'string' ? { email, name, password, role: options } : { email, name, password, ...options }
    }),
  logout: () => fetchApi('/auth/logout', { method: 'POST', body: {} }),
  getMe: () => fetchApi('/auth/me'),
  changePassword: (current_password, new_password) =>
    fetchApi('/auth/password', { method: 'POST', body: { current_password, new_password } }),

  // 1b. Workspaces & Invitations
  listWorkspaces: () => fetchApi('/workspaces'),
  createWorkspace: (data) => fetchApi('/workspaces', { method: 'POST', body: data }),
  createInvitation: (workspaceId, data) => fetchApi(`/workspaces/${workspaceId}/invitations`, { method: 'POST', body: data }),
  getInvitation: (code) => fetchApi(`/workspaces/invitations/${code}`),
  joinWorkspace: (code) => fetchApi('/workspaces/join', { method: 'POST', body: { code } }),

  // 2. Overview Summary
  getOverviewSummary: () => fetchApi('/overview/summary'),

  // 3. Work Items
  listWorkItems: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        qs.set(k, String(v));
      }
    }
    const queryStr = qs.toString();
    return fetchApi(`/work-items${queryStr ? `?${queryStr}` : ''}`);
  },

  getWorkItem: (id) => fetchApi(`/work-items/${id}`),

  createWorkItem: (teamId, data, idempotencyKey) =>
    fetchApi(`/teams/${teamId}/work-items`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: data
    }),

  patchWorkItem: (id, expectedVersion, fields, idempotencyKey) =>
    fetchApi(`/work-items/${id}`, {
      method: 'PATCH',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: { expected_version: expectedVersion, ...fields }
    }),

  claimWorkItem: (id, idempotencyKey) =>
    fetchApi(`/work-items/${id}/claim`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: {}
    }),

  releaseWorkItem: (id, expectedVersion, idempotencyKey) =>
    fetchApi(`/work-items/${id}/release`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: { expected_version: expectedVersion }
    }),

  assignWorkItem: (id, assigneeId, expectedVersion, reason, idempotencyKey) =>
    fetchApi(`/work-items/${id}/assign`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: { assignee_id: assigneeId, expected_version: expectedVersion, reason }
    }),

  transitionWorkItem: (id, action, expectedVersion, reason, idempotencyKey) =>
    fetchApi(`/work-items/${id}/transition`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: { action, expected_version: expectedVersion, reason }
    }),

  addComment: (id, text, idempotencyKey) =>
    fetchApi(`/work-items/${id}/comments`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: { text }
    }),

  // Co-assignee management (supports single user ID or array of user IDs)
  addAssignee: (workItemId, userIdOrIds, expectedVersion, idempotencyKey) => {
    const body = Array.isArray(userIdOrIds)
      ? { user_ids: userIdOrIds, expected_version: expectedVersion }
      : { user_id: userIdOrIds, expected_version: expectedVersion };
    return fetchApi(`/work-items/${workItemId}/assignees`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body
    });
  },

  removeAssignee: (workItemId, userId, idempotencyKey) =>
    fetchApi(`/work-items/${workItemId}/assignees/${userId}`, {
      method: 'DELETE',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}
    }),

  listEvents: (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchApi(`/work-items/${id}/events${qs ? `?${qs}` : ''}`);
  },

  // 4. Notifications
  listNotifications: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchApi(`/notifications${qs ? `?${qs}` : ''}`);
  },

  markNotificationRead: (id) =>
    fetchApi(`/notifications/${id}/read`, { method: 'POST' }),

  // 5. Team Members
  listTeamMembers: (teamId) => fetchApi(`/teams/${teamId}/members`),

  addTeamMember: (teamId, email, role, idempotencyKey) =>
    fetchApi(`/teams/${teamId}/members`, {
      method: 'POST',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: { email, role }
    }),

  updateTeamMemberRole: (teamId, userId, role, idempotencyKey) =>
    fetchApi(`/teams/${teamId}/members/${userId}`, {
      method: 'PATCH',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      body: { role }
    }),

  removeTeamMember: (teamId, userId, idempotencyKey) =>
    fetchApi(`/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}
    }),

  // 6. Team Chat
  listTeamMessages: (teamId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchApi(`/teams/${teamId}/messages${qs ? `?${qs}` : ''}`);
  },

  sendTeamMessage: (teamId, content) =>
    fetchApi(`/teams/${teamId}/messages`, {
      method: 'POST',
      body: { content }
    }),

  // 7. Work Item Attachments (PDFs, logs, specs)
  listAttachments: (workItemId) =>
    fetchApi(`/work-items/${workItemId}/attachments`),

  addAttachment: (workItemId, data) =>
    fetchApi(`/work-items/${workItemId}/attachments`, {
      method: 'POST',
      body: data
    }),

  deleteAttachment: (workItemId, attachmentId) =>
    fetchApi(`/work-items/${workItemId}/attachments/${attachmentId}`, {
      method: 'DELETE'
    }),

  // 8. Who's On Call & War Rooms (Google Meet / Teams)
  getOnCall: (teamId) =>
    fetchApi(`/teams/${teamId}/on-call`),

  scheduleCall: (teamId, data) =>
    fetchApi(`/teams/${teamId}/calls`, {
      method: 'POST',
      body: data
    }),

  updateCall: (teamId, callId, data) =>
    fetchApi(`/teams/${teamId}/calls/${callId}`, {
      method: 'PATCH',
      body: data
    })
};
