import {BASE_URL, getAccessToken, getDeviceId} from './client';

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
