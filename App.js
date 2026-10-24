import React, {useEffect, useRef} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import {navigationRef, resetToLogin} from './src/navigation/navigationRef';
import {onSessionExpired} from './src/api/client';
import {initPushNotifications} from './src/notifications/push';
import {handleNotificationOpen} from './src/notifications/routing';

export default function App() {
  const lastRouteKeyRef = useRef(null);

  const logCurrentRoute = (from = null) => {
    const route = navigationRef.getCurrentRoute();
    if (!route) {
      return;
    }
    const routeKey = `${route.name}:${route.key}`;
    if (routeKey === lastRouteKeyRef.current) {
      return;
    }
    lastRouteKeyRef.current = routeKey;
    console.log('[NAV] screen transition', {
      from,
      to: route.name,
      params: route.params,
    });
  };

  // Any protected API call that 401s (or finds the stored admin token past
  // its expiry) clears the token and fires this — one shared redirect
  // instead of per-screen handling.
  useEffect(() => onSessionExpired(resetToLogin), []);

  useEffect(
    () =>
      initPushNotifications({
        // Report taps open ReportDetail, support-thread taps open
        // SupportChatThread (both deferred until past Splash/Login on cold
        // start — see navigationRef.pushWhenReady).
        onNotificationOpened: handleNotificationOpen,
      }),
    [],
  );

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => logCurrentRoute()}
        onStateChange={() => {
          const previousRoute = lastRouteKeyRef.current?.split(':')[0] || null;
          logCurrentRoute(previousRoute);
        }}>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
