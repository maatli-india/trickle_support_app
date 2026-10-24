import {pushWhenReady} from '../navigation/navigationRef';

// Maps a notification payload to a screen. Used for both push taps
// (FCM `data`) and stored tray rows — both carry the same keys, set by
// transitorder's NotificationDispatch (constants/messages.go):
//
//   new report         → type "admin.report.created",
//                        entityType "report", entityId <reportId>,
//                        deeplink "trickle-admin://report/<reportId>"
//   new support thread → type "admin.support_thread.created",
//                        entityType "supportThread", entityId <threadId>,
//                        deeplink "trickle-admin://support-chat/<threadId>"

const DEEPLINK_PATTERNS = [
  {kind: 'report', re: /^trickle-admin:\/\/report\/([^/?#]+)/},
  {kind: 'supportThread', re: /^trickle-admin:\/\/support-chat\/([^/?#]+)/},
];

/**
 * @param {object} data - push `data` or a tray notification row
 * @returns {{kind: 'report'|'supportThread', id: string} | null}
 */
export const getNotificationTarget = data => {
  if (!data) {
    return null;
  }
  const entityType = data.entityType;
  const entityId = data.entityId;
  if ((entityType === 'report' || entityType === 'supportThread') && entityId) {
    return {kind: entityType, id: String(entityId)};
  }
  if (typeof data.deeplink === 'string') {
    for (const {kind, re} of DEEPLINK_PATTERNS) {
      const match = data.deeplink.match(re);
      if (match) {
        return {kind, id: decodeURIComponent(match[1])};
      }
    }
  }
  return null;
};

/**
 * Open the right screen for a tapped push notification. Report → ReportDetail;
 * support thread → SupportChatThread; anything else → no-op (the app just
 * opens where it was).
 */
export const handleNotificationOpen = data => {
  const target = getNotificationTarget(data);
  if (!target) {
    console.log('[PN] tapped notification has no known target:', data);
    return;
  }
  if (target.kind === 'report') {
    pushWhenReady('ReportDetail', {reportId: target.id});
    return;
  }
  if (target.kind === 'supportThread') {
    pushWhenReady('SupportChatThread', {threadId: target.id});
  }
};
