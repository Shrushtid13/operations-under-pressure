// src/shared/errors.js

export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details) {
  return new AppError(400, 'VALIDATION_ERROR', message, details);
}

export function idempotencyKeyRequired() {
  return new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required for this operation');
}

export function unauthenticated(message = 'Authentication required') {
  return new AppError(401, 'UNAUTHENTICATED', message);
}

export function invalidCredentials() {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
}

export function forbidden(message = 'You do not have permission to perform this action') {
  return new AppError(403, 'FORBIDDEN', message);
}

export function csrfError(message = 'CSRF validation failed') {
  return new AppError(403, 'CSRF', message);
}

export function notFound(message = 'Resource not found') {
  return new AppError(404, 'NOT_FOUND', message);
}

export function unsupportedMediaType(message = 'Content-Type must be application/json') {
  return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message);
}

export function payloadTooLarge(message = 'Payload too large') {
  return new AppError(413, 'PAYLOAD_TOO_LARGE', message);
}

export function versionConflict(message, currentItem, conflictingFields = undefined) {
  return new AppError(409, 'VERSION_CONFLICT', message, {
    current_item: currentItem,
    conflicting_fields: conflictingFields
  });
}

export function alreadyAssigned(message, currentItem, assignee = undefined) {
  return new AppError(409, 'ALREADY_ASSIGNED', message, {
    current_item: currentItem,
    assignee
  });
}

export function memberHasActiveItems(message, activeItems) {
  return new AppError(409, 'MEMBER_HAS_ACTIVE_ITEMS', message, {
    active_items: activeItems
  });
}

export function lastLead(message = 'Team must have at least one active lead') {
  return new AppError(409, 'LAST_LEAD', message);
}

export function invalidTransition(message = 'Invalid workflow state transition') {
  return new AppError(422, 'INVALID_TRANSITION', message);
}

export function approverMustDiffer(message = 'Approver must be a lead different from the approval requester') {
  return new AppError(422, 'APPROVER_MUST_DIFFER', message);
}

export function invalidAssignee(message = 'Assignee must be an active member or lead of the team') {
  return new AppError(422, 'INVALID_ASSIGNEE', message);
}

export function idempotencyKeyReused(message = 'Idempotency key reused with different request payload') {
  return new AppError(422, 'IDEMPOTENCY_KEY_REUSED', message);
}

export function rateLimited(message = 'Too many requests. Please try again later.') {
  return new AppError(429, 'RATE_LIMITED', message);
}

export function serviceUnavailable(message = 'Database service unavailable or request timed out') {
  return new AppError(503, 'UNAVAILABLE', message);
}
