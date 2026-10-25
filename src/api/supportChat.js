import {apiGet, apiPatch, apiPost, getDeviceId, WS_BASE_URL} from './client';

// Admin side of "chat with support". Mirrors the consumer app's
// src/api/supportChat.js (same backend, same wire protocol), pointed at the
// /v1/admin/ routes and authenticated with an ADMIN short token on the ws.
//
// Backend: transitorder internal/handlers/support_chat.go,
//          internal/models/support_thread.go, internal/models/chat.go.
//
// SupportThread:
//   id, userId, reason, reasonLabel, matchId?, role? ('sender'|'traveller'),
//   status: 'open' | 'resolved' | 'closed', assignedAgentId?,
//   lastMessageAt, lastMessagePreview?, createdAt, updatedAt, resolvedAt?
//
// ChatMessage:
//   id, chatId (= thread id), senderId, type: 'text'|'file'|'location',
//   text?, fileId?, location? {address, lat, lng}, replyToId?, isRead, createdAt
//
// Lists use the shared Paged envelope { total, page, limit, items }.
// NB: the envelope's `page` is computed server-side as offset/limit, so it
// comes back as (requested page - 1) — track the page client-side instead.

/** Default page size (server default 20, ListAll caps at 100). */
export const SUPPORT_THREADS_PAGE_SIZE = 20;
/** Server's ws history page size (constants.ChatLatestPageSize). */
export const SUPPORT_HISTORY_PAGE_SIZE = 20;

export const SUPPORT_THREAD_STATUSES = ['open', 'resolved', 'closed'];

const toQuery = params =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

const withQuery = (path, params) => {
  const qs = toQuery(params);
  return qs ? `${path}?${qs}` : path;
};

// ---------------------------------------------------------------------------
// REST (RequireAdminToken — bearer + X-Device-ID added by the client)
// ---------------------------------------------------------------------------

/**
 * GET /v1/admin/support-chats?status=&userId=&matchId=&page=&limit=
 * Unscoped queue, most recent activity (lastMessageAt) first. `userId`
 * narrows to one reporter's threads; `matchId` narrows to one request's
 * thread — used by the Issues list to pair a request-type report with its
 * own thread, not just any thread the same user happens to have open.
 * @returns {Promise<{total: number, page: number, limit: number, items: object[]}>}
 */
export const listSupportThreads = ({
  status,
  userId,
  matchId,
  page = 1,
  limit = SUPPORT_THREADS_PAGE_SIZE,
} = {}) => apiGet(withQuery('/v1/admin/support-chats', {status, userId, matchId, page, limit}));

/**
 * POST /v1/admin/support-chats — get-or-create a thread on behalf of a
 * specific user, the admin-initiated counterpart to the end-user app's own
 * POST /v1/support-chats (which can only ever act on the caller's own
 * identity). Body: {userId, reason, reasonLabel, matchId?, role?}.
 * @returns {Promise<object>} SupportThread
 */
export const adminCreateSupportThread = ({userId, reason, reasonLabel, matchId, role}) =>
  apiPost('/v1/admin/support-chats', {
    userId,
    reason,
    reasonLabel,
    ...(matchId ? {matchId} : {}),
    ...(role ? {role} : {}),
  });

/** GET /v1/admin/support-chats/{id} → SupportThread */
export const getSupportThread = id =>
  apiGet(`/v1/admin/support-chats/${encodeURIComponent(id)}`);

/**
 * GET /v1/admin/support-chats/{id}/messages — paged history over REST.
 * The thread screen gets history over the ws instead; this is for callers
 * that don't hold a socket.
 *
 * @param {string} id
 * @param {object} [params] - page, limit, latest, beforeMessageId
 */
export const getSupportChatMessages = (id, params = {}) =>
  apiGet(
    withQuery(`/v1/admin/support-chats/${encodeURIComponent(id)}/messages`, {
      page: params.page,
      limit: params.limit,
      latest: params.latest ? 'true' : undefined,
      beforeMessageId: params.beforeMessageId,
    }),
  );

/**
 * PATCH /v1/admin/support-chats/{id}
 * Body SupportThreadAdminUpdateModel: status (required, open|resolved|closed),
 * assignedAgentId (optional, ≤120). resolvedAt is stamped server-side for
 * resolved/closed. Returns the updated SupportThread.
 */
export const updateSupportThread = (id, {status, assignedAgentId} = {}) => {
  const body = {status};
  const agent = typeof assignedAgentId === 'string' ? assignedAgentId.trim() : '';
  if (agent) {
    body.assignedAgentId = agent;
  }
  return apiPatch(`/v1/admin/support-chats/${encodeURIComponent(id)}`, body);
};

/**
 * POST /v1/admin/auth/short-token — short-lived JWT derived from the admin's
 * own session, used only as the ws `?access_token=`.
 * Response → Token { accessToken, expiresIn, type } (refreshToken omitted).
 */
export const mintAdminShortToken = () => apiPost('/v1/admin/auth/short-token', null);

// ---------------------------------------------------------------------------
// WebSocket  wss://…/v1/admin/support-chats/{id}/ws?access_token=<short JWT>
// (RequireAdminShortToken). Frames are { event, payload } JSON.
//   server → client: 'history' (ChatMessage[], ascending),
//                    'message' (ChatMessage, room broadcast — incl. our own),
//                    'connected' ({message}), 'error' ({message})
//   client → server: 'support_message' ({type:'text', text, replyToId?}),
//                    'support_fetch_history' ({beforeMessageId})
// ---------------------------------------------------------------------------

/**
 * Open an authenticated ws to one support thread. Mints a fresh admin short
 * token first, then connects with it as `?access_token=`. X-Device-ID goes on
 * the handshake via RN's third WebSocket constructor arg (same as the
 * consumer app).
 *
 * @param {string} threadId
 * @param {object} [handlers] - onOpen, onConnected, onHistory(items),
 *   onMessage(message), onServerError(text), onError(event), onClose(event)
 * @returns {Promise<WebSocket>}
 */
export const connectAdminSupportChatWebSocket = async (threadId, handlers = {}) => {
  const {onMessage, onHistory, onConnected, onServerError, onOpen, onClose, onError} =
    handlers;

  const {accessToken: shortToken} = (await mintAdminShortToken()) || {};
  if (!shortToken) {
    throw new Error('Could not start a chat session — please try again.');
  }

  const url = `${WS_BASE_URL}/v1/admin/support-chats/${encodeURIComponent(
    threadId,
  )}/ws?access_token=${encodeURIComponent(shortToken)}`;
  const deviceId = getDeviceId();
  const ws = new WebSocket(
    url,
    undefined,
    deviceId ? {headers: {'X-Device-ID': deviceId}} : undefined,
  );

  ws.onopen = () => onOpen?.();
  ws.onclose = event => onClose?.(event);
  ws.onerror = event => onError?.(event);
  ws.onmessage = event => {
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch (_) {
      return;
    }
    switch (frame?.event) {
      case 'history':
        if (Array.isArray(frame.payload)) {
          onHistory?.(frame.payload);
        }
        break;
      case 'message':
        if (frame.payload?.id) {
          onMessage?.(frame.payload);
        }
        break;
      case 'connected':
        onConnected?.();
        break;
      case 'error':
        onServerError?.(frame.payload?.message || 'Something went wrong with this chat.');
        break;
      default:
        break;
    }
  };

  return ws;
};

const sendSocketEvent = (ws, event, payload) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  ws.send(JSON.stringify({event, payload}));
  return true;
};

/**
 * Send a text message. Event is 'support_message' — NOT 'message': both chat
 * kinds share one socket server with one handler per event name.
 * @returns {boolean} false if the socket wasn't open (keep the draft)
 */
export const sendSupportMessage = (ws, text, replyToId) =>
  sendSocketEvent(ws, 'support_message', {
    type: 'text',
    text,
    ...(replyToId ? {replyToId} : {}),
  });

/**
 * Send an already-uploaded image/file through an open support-chat
 * WebSocket. The file must already be READY (see uploadSupportChatImage in
 * src/api/files.js) — the server re-checks this and rejects anything else.
 * @returns {boolean} false if the socket wasn't open (caller should retry)
 */
export const sendSupportFileMessage = (ws, fileId, replyToId) =>
  sendSocketEvent(ws, 'support_message', {
    type: 'file',
    fileId,
    ...(replyToId ? {replyToId} : {}),
  });

/**
 * Ask for the page just before beforeMessageId; the reply arrives as a
 * 'history' frame. Event is 'support_fetch_history' (see above).
 */
export const fetchOlderSupportMessages = (ws, beforeMessageId) =>
  sendSocketEvent(ws, 'support_fetch_history', {beforeMessageId});
