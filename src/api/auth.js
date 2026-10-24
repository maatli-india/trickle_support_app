import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {
  apiPost,
  clearTokens,
  ensureDeviceId,
  getDeviceId,
  isUnauthorizedError,
  setTokens,
} from './client';

const cleanToken = value => {
  if (typeof value !== 'string') {
    return null;
  }
  const token = value.replace(/^Bearer\s+/i, '').trim();
  return token || null;
};

// ---------------------------------------------------------------------------
// POST /v1/admin/auth/login  — public, but requires X-Device-ID (audit)
// ---------------------------------------------------------------------------

/**
 * Log an admin / support user in.
 *
 * Response → Token { accessToken, refreshToken, expiresIn (seconds), type }
 * On success both tokens and the access token's absolute expiry (now +
 * expiresIn) are stored.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresIn: number, type: string}>}
 */
export const adminLogin = async (username, password) => {
  // Safety-net: X-Device-ID must be present on this public route.
  if (!getDeviceId()) {
    await ensureDeviceId();
  }

  const res = await apiPost(
    '/v1/admin/auth/login',
    {username, password},
    {isPublic: true, withDeviceId: true},
  );

  const accessToken = cleanToken(res?.accessToken ?? res?.access_token);
  if (!accessToken) {
    await clearTokens();
    throw Object.assign(
      new Error('Login succeeded but access token was missing in server response.'),
      {status: 0, data: res || {}},
    );
  }
  const refreshToken = cleanToken(res?.refreshToken ?? res?.refresh_token);

  const expiresIn = Number(res?.expiresIn);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? Date.now() + expiresIn * 1000
      : null;

  await setTokens(accessToken, refreshToken, expiresAt);
  return res;
};

// ---------------------------------------------------------------------------
// POST /v1/admin/auth/logout — RequireAdminToken. Revokes the admin's
// refresh-token session server-side so it can't be used again, then clears
// local storage either way (a failed revoke call shouldn't trap the admin
// in a logged-in-looking state on this device).
// ---------------------------------------------------------------------------

export const logout = async () => {
  try {
    await apiPost('/v1/admin/auth/logout');
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      console.log('[AUTH] logout request failed:', error?.message);
    }
  } finally {
    await clearTokens();
  }
};

// ---------------------------------------------------------------------------
// POST /v1/admin/devices  — RequireAdminToken
// ---------------------------------------------------------------------------

/**
 * Register (upsert) this install's FCM token for admin-broadcast pushes.
 * Must be called while logged in. Backend recommends calling on every app
 * launch and on FCM token refresh.
 *
 * Response → SimpleResponse { message }
 *
 * @param {string} token       - FCM registration token
 * @param {string} [deviceId]  - defaults to the stored device ID
 * @param {string} [platform]  - defaults to Platform.OS ('ios' | 'android')
 * @param {string} [appVersion] - optional, defaults to the app's version
 */
export const registerPushToken = async (
  token,
  deviceId,
  platform = Platform.OS,
  appVersion,
) => {
  const body = {
    token,
    deviceId: deviceId || (await ensureDeviceId()),
    platform,
  };
  const version = appVersion ?? safeAppVersion();
  if (version) {
    body.appVersion = version;
  }
  return apiPost('/v1/admin/devices', body);
};

const safeAppVersion = () => {
  try {
    return DeviceInfo.getVersion();
  } catch (_) {
    return undefined;
  }
};
