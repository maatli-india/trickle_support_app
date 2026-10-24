import {PermissionsAndroid, Platform} from 'react-native';
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import notifee, {AndroidImportance, EventType} from '@notifee/react-native';
import {ensureDeviceId, hasValidSession, loadTokens} from '../api/client';
import {registerPushToken} from '../api/auth';
import {handleNotificationOpen} from './routing';

// Ported from the consumer app's App.js / index.js FCM + notifee setup.
//
// Every entry point here is defensive (try/catch, never throws): until the
// native Firebase config (GoogleService-Info.plist / google-services.json +
// FirebaseApp.configure()) is added for this app's bundle ID, getMessaging()
// throws "No Firebase App '[DEFAULT]' has been created" — push must degrade
// to a no-op rather than break login.

const CHANNEL_ID = 'default';

const messagingOrNull = () => {
  try {
    return getMessaging();
  } catch (error) {
    console.warn('[PN] Firebase messaging unavailable:', error?.message || error);
    return null;
  }
};

// ---------------------------------------------------------------------------
// 1. Permission
// ---------------------------------------------------------------------------

export const requestPushPermission = async () => {
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        console.log('[PN] Android notification permission:', granted);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    }

    const messaging = messagingOrNull();
    if (!messaging) {
      return false;
    }
    const authStatus = await requestPermission(messaging);
    const allowed =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;
    console.log('[PN] iOS notification permission:', {
      status: authStatus,
      allowed,
    });
    return allowed;
  } catch (error) {
    console.warn('[PN] permission request failed:', error?.message || error);
    return false;
  }
};

// ---------------------------------------------------------------------------
// 2. FCM token
// ---------------------------------------------------------------------------

export const getFCMToken = async () => {
  const messaging = messagingOrNull();
  if (!messaging) {
    return null;
  }
  try {
    const token = await getToken(messaging);
    console.log(
      '[PN] FCM token:',
      token ? `present (${token.length} chars)` : 'missing',
    );
    return token || null;
  } catch (error) {
    console.warn('[PN] FCM token request failed:', {
      code: error?.code,
      message: error?.message,
    });
    return null;
  }
};

// ---------------------------------------------------------------------------
// 3. Backend registration (POST /v1/admin/devices) — only while logged in
// ---------------------------------------------------------------------------

/**
 * Register a token with the backend if (and only if) an admin session is
 * active. Best-effort: logs and returns false on failure, never throws.
 */
export const syncPushToken = async token => {
  if (!token || !hasValidSession()) {
    return false;
  }
  try {
    const deviceId = await ensureDeviceId();
    await registerPushToken(token, deviceId, Platform.OS);
    console.log('[PN] FCM token registered with backend');
    return true;
  } catch (error) {
    console.warn(
      '[PN] FCM token registration failed:',
      error?.status,
      error?.message || error,
    );
    return false;
  }
};

/**
 * Full "this logged-in device should receive pushes" flow: permission →
 * FCM token → POST /v1/admin/devices. Call right after login succeeds and on
 * app launch when a session already exists. Fire-and-forget; never throws.
 */
export const registerDeviceForPush = async () => {
  try {
    const allowed = await requestPushPermission();
    if (!allowed) {
      console.warn('[PN] permission not granted — skipping registration');
      return false;
    }
    const token = await getFCMToken();
    return syncPushToken(token);
  } catch (error) {
    console.warn('[PN] registerDeviceForPush failed:', error?.message || error);
    return false;
  }
};

// ---------------------------------------------------------------------------
// 4. Display (foreground + Android data-only background)
// ---------------------------------------------------------------------------

export const showForegroundNotification = async remoteMessage => {
  const title = remoteMessage?.notification?.title || remoteMessage?.data?.title;
  const body = remoteMessage?.notification?.body || remoteMessage?.data?.body;
  if (!title && !body) {
    return;
  }

  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Notifications',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  await notifee.displayNotification({
    title: title || 'Trickle Support',
    body: body || 'You have a new notification.',
    data: remoteMessage?.data || {},
    android: {
      channelId: CHANNEL_ID,
      smallIcon: 'ic_launcher',
      pressAction: {id: 'default'},
      sound: 'default',
    },
    ios: {sound: 'default'},
  });
};

// ---------------------------------------------------------------------------
// 5. Listeners (call once from App.js)
// ---------------------------------------------------------------------------

/**
 * Wire foreground display, token refresh, and tap handling.
 *
 * @param {object} [handlers]
 * @param {(data: object) => void} [handlers.onNotificationOpened]
 *        Called with the notification's `data` payload when the user taps a
 *        notification (background, quit/cold-start, or a foreground notifee
 *        notification). Deep-linking to a specific screen is up to the caller.
 * @returns {() => void} cleanup
 */
export const initPushNotifications = ({onNotificationOpened} = {}) => {
  const unsubscribers = [];
  const opened = (source, data) => {
    console.log('[PN] notification opened via', source, data);
    try {
      onNotificationOpened?.(data || {});
    } catch (error) {
      console.warn('[PN] onNotificationOpened failed:', error?.message || error);
    }
  };

  const messaging = messagingOrNull();
  if (messaging) {
    try {
      unsubscribers.push(
        onMessage(messaging, async remoteMessage => {
          console.log('[PN] foreground message:', remoteMessage?.messageId);
          try {
            await showForegroundNotification(remoteMessage);
          } catch (error) {
            console.warn(
              '[PN] foreground display failed:',
              error?.message || error,
            );
          }
        }),
      );

      unsubscribers.push(
        onTokenRefresh(messaging, async token => {
          console.log('[PN] FCM token refreshed');
          if (!hasValidSession()) {
            await loadTokens();
          }
          await syncPushToken(token);
        }),
      );

      unsubscribers.push(
        onNotificationOpenedApp(messaging, remoteMessage =>
          opened('background', remoteMessage?.data),
        ),
      );

      getInitialNotification(messaging)
        .then(remoteMessage => {
          if (remoteMessage) {
            opened('cold-start', remoteMessage.data);
          }
        })
        .catch(() => {});
    } catch (error) {
      console.warn('[PN] messaging listener setup failed:', error?.message || error);
    }
  }

  // Taps on notifications we displayed ourselves via notifee while foregrounded.
  try {
    unsubscribers.push(
      notifee.onForegroundEvent(({type, detail}) => {
        if (type === EventType.PRESS) {
          opened('notifee-foreground', detail?.notification?.data);
        }
      }),
    );
    // A notifee-displayed notification (Android data-only push) tapped while
    // the app was killed launches the app — FCM's getInitialNotification
    // doesn't see those, notifee's does.
    notifee
      .getInitialNotification()
      .then(initial => {
        if (initial?.notification) {
          opened('notifee-cold-start', initial.notification.data);
        }
      })
      .catch(() => {});
  } catch (error) {
    console.warn('[PN] notifee listener setup failed:', error?.message || error);
  }

  return () => {
    unsubscribers.forEach(unsubscribe => {
      try {
        unsubscribe?.();
      } catch (_) {}
    });
  };
};

// ---------------------------------------------------------------------------
// 6. Headless / background handlers (call once from index.js, before
//    AppRegistry.registerComponent)
// ---------------------------------------------------------------------------

export const registerBackgroundHandlers = () => {
  const messaging = messagingOrNull();
  if (messaging) {
    try {
      setBackgroundMessageHandler(messaging, async remoteMessage => {
        console.log('[PN] background message:', remoteMessage?.messageId);
        // Notification messages are shown by the OS; only Android data-only
        // messages need a local notification (same as the consumer app).
        if (Platform.OS !== 'android' || remoteMessage?.notification) {
          return;
        }
        await showForegroundNotification(remoteMessage);
      });
    } catch (error) {
      console.warn('[PN] background handler setup failed:', error?.message || error);
    }
  }

  try {
    // Required by notifee for presses on its notifications while the app is
    // backgrounded. If the JS context is alive the target is pushed (or
    // parked until past Splash/Login); a killed-app press is picked up by
    // notifee.getInitialNotification() in initPushNotifications instead.
    notifee.onBackgroundEvent(async ({type, detail}) => {
      if (type === EventType.PRESS) {
        console.log('[PN] notifee background press:', detail?.notification?.id);
        try {
          handleNotificationOpen(detail?.notification?.data || {});
        } catch (error) {
          console.warn('[PN] background press routing failed:', error?.message);
        }
      }
    });
  } catch (error) {
    console.warn('[PN] notifee background setup failed:', error?.message || error);
  }
};
