import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

/**
 * Base URL for all API calls — same backend as the consumer app.
 */
export const BASE_URL = 'https://api-dev.trickle.org.in/trickle';

/** WebSocket base (https → wss), same derivation as the consumer app. */
export const WS_BASE_URL = BASE_URL.replace(/^http/, 'ws');

// ---------------------------------------------------------------------------
// Persistent store — admin access + refresh token (+ expiry) and device ID
//
// POST /v1/admin/auth/login and /v1/admin/auth/refresh both return
// {accessToken, refreshToken, expiresIn, type}. The access token is
// short-lived (~1h); when it expires (or a protected request gets a 401)
// attemptTokenRefresh() silently exchanges the refresh token for a new pair
// via /v1/admin/auth/refresh instead of forcing a full re-login — only once
// the refresh token itself is rejected (expired/revoked/missing) does the
// session actually end.
// ---------------------------------------------------------------------------

const STORAGE_KEY_ACCESS = '@trickleSupport/accessToken';
const STORAGE_KEY_REFRESH = '@trickleSupport/refreshToken';
const STORAGE_KEY_EXPIRES_AT = '@trickleSupport/accessTokenExpiresAt';
const STORAGE_KEY_DEVICE = '@trickleSupport/deviceId';

// ---------------------------------------------------------------------------
// UUID v4 generator (fallback device ID) — must be defined before use below
// ---------------------------------------------------------------------------

const generateUUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

let _accessToken = null;
let _refreshToken = null;
let _expiresAt = null; // epoch ms, or null when unknown
let _deviceId = null;

export const ensureDeviceId = async () => {
  if (_deviceId) {
    return _deviceId;
  }

  const storedDeviceId = await AsyncStorage.getItem(STORAGE_KEY_DEVICE);
  if (storedDeviceId) {
    _deviceId = storedDeviceId;
    return _deviceId;
  }

  let deviceId = null;
  try {
    deviceId = await DeviceInfo.getUniqueId();
  } catch (_) {
    deviceId = null;
  }
  _deviceId = deviceId || generateUUID();
  await AsyncStorage.setItem(STORAGE_KEY_DEVICE, _deviceId);
  return _deviceId;
};

// ---------------------------------------------------------------------------
// Session-expired listeners
//
// The client never navigates by itself. When a protected request gets a 401
// (or the stored token is already past its expiry) the token is cleared and
// every listener registered here is called once. App.js subscribes and resets
// the navigator to Login — so screens don't each need their own redirect.
// ---------------------------------------------------------------------------

const _sessionExpiredListeners = new Set();

/**
 * Subscribe to "session expired / unauthorized" events.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export const onSessionExpired = listener => {
  _sessionExpiredListeners.add(listener);
  return () => _sessionExpiredListeners.delete(listener);
};

const notifySessionExpired = () => {
  _sessionExpiredListeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      console.warn('[AUTH] session-expired listener failed:', e?.message);
    }
  });
};

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Persist the admin access + refresh token (and the access token's absolute
 * expiry) in memory AND AsyncStorage. Pass refreshToken = undefined to leave
 * whatever's already stored untouched (e.g. a caller that only ever sees the
 * access token); pass null explicitly to clear it.
 *
 * @param {string|null} accessToken
 * @param {string|null|undefined} [refreshToken]
 * @param {number|null} [expiresAt] - epoch milliseconds
 */
export const setTokens = async (accessToken, refreshToken, expiresAt = null) => {
  _accessToken = accessToken || null;
  if (refreshToken !== undefined) {
    _refreshToken = refreshToken || null;
  }
  _expiresAt = accessToken && expiresAt ? Number(expiresAt) : null;
  console.log(
    '[TOKEN] setTokens — access:',
    _accessToken ? 'present' : 'NULL',
    '| refresh:',
    _refreshToken ? 'present' : 'NULL',
    '| expiresAt:',
    _expiresAt ? new Date(_expiresAt).toISOString() : 'unknown',
  );
  try {
    if (_accessToken) {
      await AsyncStorage.setItem(STORAGE_KEY_ACCESS, _accessToken);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_ACCESS);
    }
    if (refreshToken !== undefined) {
      if (_refreshToken) {
        await AsyncStorage.setItem(STORAGE_KEY_REFRESH, _refreshToken);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY_REFRESH);
      }
    }
    if (_expiresAt) {
      await AsyncStorage.setItem(STORAGE_KEY_EXPIRES_AT, String(_expiresAt));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
    }
  } catch (e) {
    console.log('[TOKEN] setTokens persist error:', e?.message);
  }
};

/**
 * Clear the stored access + refresh token (logout / refresh failure). The
 * device ID is kept.
 */
export const clearTokens = async () => {
  _accessToken = null;
  _refreshToken = null;
  _expiresAt = null;
  try {
    await AsyncStorage.removeMany([
      STORAGE_KEY_ACCESS,
      STORAGE_KEY_REFRESH,
      STORAGE_KEY_EXPIRES_AT,
    ]);
  } catch (_) {}
};

/**
 * Load token + expiry from AsyncStorage into memory and make sure a device ID
 * exists. Call once on app start (Splash does this).
 */
export const loadTokens = async () => {
  try {
    const [access, refresh, expiresAt] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_ACCESS),
      AsyncStorage.getItem(STORAGE_KEY_REFRESH),
      AsyncStorage.getItem(STORAGE_KEY_EXPIRES_AT),
    ]);
    await ensureDeviceId();
    _accessToken = access || null;
    _refreshToken = refresh || null;
    _expiresAt = expiresAt ? Number(expiresAt) : null;
    console.log(
      '[TOKEN] loadTokens — access:',
      _accessToken ? 'present' : 'NULL',
      '| refresh:',
      _refreshToken ? 'present' : 'NULL',
    );
  } catch (e) {
    console.log('[TOKEN] loadTokens error:', e?.message);
  }
};

export const getAccessToken = () => _accessToken;
export const getRefreshToken = () => _refreshToken;
export const getTokenExpiresAt = () => _expiresAt;
export const getDeviceId = () => _deviceId;

/** True when the in-memory token is past its stored expiry. */
export const isTokenExpired = () =>
  Boolean(_expiresAt) && Date.now() >= _expiresAt;

/** True when there is a token in memory that has not expired. */
export const hasValidSession = () => Boolean(_accessToken) && !isTokenExpired();

/** Convenience for screens: is this thrown API error an auth failure? */
export const isUnauthorizedError = error => error?.status === 401;

const unauthorizedError = message =>
  Object.assign(new Error(message), {status: 401, data: {}});

// ---------------------------------------------------------------------------
// Silent token refresh — POST /v1/admin/auth/refresh
//
// Called both proactively (the stored access token is already past its
// expiry before a request even goes out) and reactively (a protected
// request came back 401). A raw fetch, not routed through request() below,
// so this has no circular dependency on the 401-handling it's called from.
// Concurrent callers share one in-flight attempt via _refreshPromise, so N
// requests failing at once don't fire N refresh calls (and don't race each
// other through the backend's refresh-token rotation, which revokes the old
// token the moment the first one succeeds — a second concurrent exchange of
// the same now-revoked token would otherwise itself come back 401).
// ---------------------------------------------------------------------------

let _refreshPromise = null;

/** @returns {Promise<boolean>} true if the access token was refreshed. */
const attemptTokenRefresh = () => {
  if (_refreshPromise) {
    return _refreshPromise;
  }
  if (!_refreshToken) {
    return Promise.resolve(false);
  }
  _refreshPromise = (async () => {
    try {
      const deviceId = await ensureDeviceId();
      console.log('[AUTH] attempting token refresh');
      const response = await fetch(`${BASE_URL}/v1/admin/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': deviceId,
        },
        body: JSON.stringify({refreshToken: _refreshToken}),
      });
      if (!response.ok) {
        console.log('[AUTH] token refresh failed, status', response.status);
        return false;
      }
      let data;
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      const accessToken = data?.accessToken;
      const refreshToken = data?.refreshToken;
      if (!accessToken || !refreshToken) {
        console.log('[AUTH] token refresh response missing tokens');
        return false;
      }
      const expiresIn = Number(data?.expiresIn);
      const expiresAt =
        Number.isFinite(expiresIn) && expiresIn > 0
          ? Date.now() + expiresIn * 1000
          : null;
      await setTokens(accessToken, refreshToken, expiresAt);
      console.log('[AUTH] token refreshed');
      return true;
    } catch (e) {
      console.log('[AUTH] token refresh error:', e?.message);
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
};

/**
 * True when there's a usable session — either the stored access token is
 * still within its expiry, or (when it's expired) a refresh token on hand
 * was just successfully exchanged for a new one. Call once on app start,
 * right after loadTokens() — in place of hasValidSession() alone, which
 * only checks the access token's own expiry and says nothing about whether
 * a refresh token could extend the session.
 *
 * Without this, Splash was treating "access token's ~1h window elapsed
 * since the app was last opened" as a full logout and wiping the refresh
 * token right along with it (see Splash's clearTokens() call), even though
 * the refresh token was still perfectly valid — the admin app has no
 * equivalent of the consumer app's App.js, which never checks expiry at
 * startup at all and just trusts a stored access token until some real
 * request 401s and attemptTokenRefresh() quietly handles it. For a support
 * admin opening the app a few times a day, that meant a fresh login almost
 * every single time.
 *
 * @returns {Promise<boolean>}
 */
export const ensureValidSession = async () => {
  if (hasValidSession()) {
    return true;
  }
  if (!_accessToken || !_refreshToken) {
    return false;
  }
  return attemptTokenRefresh();
};

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RequestOptions
 * @property {boolean} [isPublic]     - When true, omits Authorization header
 *                                      and skips 401 → session-expired handling.
 * @property {boolean} [withDeviceId] - When true, adds X-Device-ID even on
 *                                      public routes (admin login needs it).
 * @property {boolean} [suppressErrorLog] - Don't log expected errors.
 */

/**
 * Executes an HTTP request against the Trickle API.
 *
 * Protected routes automatically receive:
 *   Authorization: Bearer <accessToken>
 *   X-Device-ID: <deviceId>
 *
 * A 401 on a protected route clears the stored token, fires
 * onSessionExpired listeners (→ App.js resets to Login), and rethrows.
 *
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
 * @param {string} path            - e.g. '/v1/admin/reports'
 * @param {object|null} [body]
 * @param {RequestOptions} [options]
 * @returns {Promise<any>}  parsed JSON, or null for 204
 * @throws {Error & { status: number, data: object }}
 */
const request = async (method, path, body = null, options = {}) => {
  const deviceId = await ensureDeviceId();

  // Ensure the token is loaded from AsyncStorage (handles hot-reload / memory reset)
  if (!options.isPublic && !_accessToken) {
    await loadTokens();
  }

  if (!options.isPublic) {
    if (!_accessToken) {
      throw unauthorizedError('You are not logged in.');
    }
    if (isTokenExpired()) {
      console.log('[AUTH] token expired before', method, path, '— refreshing');
      const refreshed = await attemptTokenRefresh();
      if (!refreshed) {
        console.log('[AUTH] refresh failed before', method, path, '— clearing session');
        await clearTokens();
        notifySessionExpired();
        throw unauthorizedError('Session expired. Please log in again.');
      }
    }
  }

  const headers = {'Content-Type': 'application/json'};

  if (!options.isPublic) {
    headers.Authorization = `Bearer ${_accessToken}`;
    if (deviceId) {
      headers['X-Device-ID'] = deviceId;
    }
  } else if (options.withDeviceId && deviceId) {
    headers['X-Device-ID'] = deviceId;
  }

  const config = {method, headers};
  if (body !== null && body !== undefined) {
    config.body = JSON.stringify(body);
  }
  console.log('[HTTP] Request sent', {method, path});

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, config);
    console.log('[HTTP] Response received', {
      method,
      path,
      status: response.status,
      ok: response.ok,
    });
  } catch {
    console.error('[HTTP] Network request failed', {method, path});
    throw Object.assign(
      new Error('Network error. Please check your connection.'),
      {status: 0, data: {}},
    );
  }

  if (response.status === 204) {
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  // ── 401 on a protected route: try a silent refresh once, then retry ──
  if (response.status === 401 && !options.isPublic) {
    if (!options._isRetry) {
      console.log('[AUTH] 401 on', method, path, '— attempting token refresh');
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        return request(method, path, body, {...options, _isRetry: true});
      }
    }
    console.log('[AUTH] 401 on', method, path, '— clearing session');
    await clearTokens();
    notifySessionExpired();
  }

  if (!response.ok) {
    let errorMessage = data?.message;
    if (!errorMessage && data?.messages && typeof data.messages === 'object') {
      errorMessage = Object.entries(data.messages)
        .map(
          ([field, msg]) =>
            `${field.charAt(0).toUpperCase() + field.slice(1)}: ${msg}`,
        )
        .join('\n');
    }
    if (!options.suppressErrorLog) {
      console.error('[HTTP] Request failed', {
        method,
        path,
        status: response.status,
        message: errorMessage,
      });
    }
    throw Object.assign(
      new Error(errorMessage ?? `Request failed with status ${response.status}`),
      {status: response.status, data},
    );
  }

  return data;
};

export const apiGet = (path, options) => request('GET', path, null, options);
export const apiPost = (path, body, options) =>
  request('POST', path, body, options);
export const apiPut = (path, body, options) =>
  request('PUT', path, body, options);
export const apiPatch = (path, body, options) =>
  request('PATCH', path, body, options);
export const apiDelete = (path, options, body) =>
  request('DELETE', path, body, options);
