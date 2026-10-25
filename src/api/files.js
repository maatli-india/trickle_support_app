import {apiGet, BASE_URL, getAccessToken, getDeviceId} from './client';

// ---------------------------------------------------------------------------
// Admin-side file upload — mirrors the consumer app's src/api/files.js
// upload pipeline (mint upload URL -> PUT bytes -> poll status), but against
// admin-only mint/status routes under /v1/admin/file/... (RequireAdminToken
// — apiGet already attaches Authorization/X-Device-ID for a protected
// route). The consumer app's own /v1/file/... routes are RequireAccessToken
// and reject admin tokens outright, so this app needed its own mirror of
// them (see transitorder's routers/admin.go and orchestrators/file.go's
// uploadActorFields/authorizeUploadRead admin-token cases).
// ---------------------------------------------------------------------------

const CONTENT_TYPE_ALIASES = {'image/jpg': 'image/jpeg'};

const normalizeContentType = type => {
  const lower = (type || '').toLowerCase().trim();
  return lower ? CONTENT_TYPE_ALIASES[lower] || lower : 'image/jpeg';
};

const getFileUploadUrl = (fileType, fileContentType, groupId) => {
  const params = new URLSearchParams({fileType, fileContentType});
  if (groupId) {
    params.set('groupId', groupId);
  }
  return apiGet(`/v1/admin/file/upload-url?${params.toString()}`);
};

const getFileStatus = fileId =>
  apiGet(`/v1/admin/file/${encodeURIComponent(fileId)}/status`);

const pollFileStatus = async (fileId, {intervalMs = 1500, timeoutMs = 45000} = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const status = await getFileStatus(fileId);
    if (status?.status && status.status !== 'PENDING') {
      return status;
    }
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the upload to finish processing.');
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
};

// Same cross-platform body-as-uri PUT as the consumer app's putAssetBytes —
// passing `{uri}` as the fetch body (not a Blob read via a prior fetch) is
// required for this to work on Android's content:// asset URIs.
const putAssetBytes = async (uploadTarget, asset) => {
  const response = await fetch(uploadTarget.uploadUrl, {
    method: 'PUT',
    headers: {...(uploadTarget.requiredHeaders || {})},
    body: {uri: asset.uri},
  });
  if (!response.ok) {
    throw new Error(`Photo upload failed (${response.status}).`);
  }
};

/**
 * Uploads one support-chat image as the authenticated admin and waits for it
 * to finish processing. Returns the Kosh fileId when READY (pass it to
 * sendSupportFileMessage()), or null if it ends up FAILED.
 *
 * @param {string} threadId
 * @param {{uri: string, type?: string}} asset
 */
export const uploadSupportChatImage = async (threadId, asset) => {
  if (!threadId || !asset?.uri) {
    return null;
  }
  let target = await getFileUploadUrl('support_attach', normalizeContentType(asset.type), threadId);
  try {
    await putAssetBytes(target, asset);
  } catch (uploadError) {
    // The uploadUrl may have expired — mint a fresh one and retry once.
    target = await getFileUploadUrl('support_attach', normalizeContentType(asset.type), threadId);
    await putAssetBytes(target, asset);
  }
  const status = await pollFileStatus(target.fileId);
  return status.status === 'READY' ? status.fileId : null;
};

/**
 * Image `source` for an uploaded file (report attachment, parcel image, ...)
 * by its file ID.
 *
 * Report `photos` are file IDs, not URLs. GET /v1/admin/files/{fileId}/download-url
 * (RequireAdminToken → needs Bearer + X-Device-ID) answers with a 302 to a
 * presigned storage URL, which <Image> follows natively — so the headers
 * only need to be on this first request.
 */
export const adminFileImageSource = fileId => {
  const headers = {};
  const token = getAccessToken();
  const deviceId = getDeviceId();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (deviceId) {
    headers['X-Device-ID'] = deviceId;
  }
  return {
    uri: `${BASE_URL}/v1/admin/files/${encodeURIComponent(
      fileId,
    )}/download-url`,
    headers,
  };
};
