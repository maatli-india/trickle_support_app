import {apiGet, apiPut} from './client';

// Backend: transitorder internal/routers/notification.go,
// internal/handlers/notification.go, internal/models/notification.go.
// All routes accept the admin token (RequireTrayToken scopes the tray to the
// calling admin).
//
// Notification row:
//   { id, tenantId, recipientType, recipientId, type, title, body,
//     target?, deeplink?, entityType?, entityId?, readAt, pushSent,
//     createdAt, deleteAfter }
// There is no `isRead` boolean — read state is `readAt`. Because readAt is a
// non-pointer Go time.Time, an UNREAD row serializes it as the zero time
// "0001-01-01T00:00:00Z" (omitempty does not drop structs) — use
// isNotificationUnread() rather than a truthiness check.

export const NOTIFICATIONS_PAGE_SIZE = 20;

/** entityType values set by the admin broadcasts (constants/messages.go). */
export const NOTIFICATION_ENTITY_REPORT = 'report';
export const NOTIFICATION_ENTITY_SUPPORT_THREAD = 'supportThread';

export const isNotificationUnread = notification => {
  const readAt = notification?.readAt;
  if (!readAt) {
    return true;
  }
  // Zero time (year 1) or unparsable → unread.
  const date = new Date(readAt);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1;
};

/**
 * GET /v1/notifications?page=&limit=&unreadOnly=&type=&entityType=&entityId=
 * Newest first. Paged envelope: { total, page, limit, items }.
 */
export const listNotifications = ({
  page = 1,
  limit = NOTIFICATIONS_PAGE_SIZE,
  unreadOnly,
} = {}) => {
  const params = [`page=${page}`, `limit=${limit}`];
  if (unreadOnly) {
    params.push('unreadOnly=true');
  }
  return apiGet(`/v1/notifications?${params.join('&')}`);
};

/** GET /v1/notifications/unread-count → { count } — returns the number. */
export const getUnreadNotificationCount = async () => {
  const res = await apiGet('/v1/notifications/unread-count', {
    suppressErrorLog: true,
  });
  const count = Number(res?.count);
  return Number.isFinite(count) ? count : 0;
};

/** PUT /v1/notifications/{id}/read → { message } */
export const markNotificationRead = id =>
  apiPut(`/v1/notifications/${encodeURIComponent(id)}/read`, null);

/** PUT /v1/notifications/read-all → { message } */
export const markAllNotificationsRead = () =>
  apiPut('/v1/notifications/read-all', null);
