import React, {useEffect} from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import colors from '../constants/colors';
import fonts from '../constants/fonts';
import {
  clearTokens,
  ensureValidSession,
  getAccessToken,
  loadTokens,
} from '../api/client';
import {registerDeviceForPush} from '../notifications/push';

// Keep the brand moment on screen briefly even when the token check is instant.
const MIN_SPLASH_MS = 1200;

export default function SplashScreen({navigation}) {
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const boot = async () => {
      let loggedIn = false;
      try {
        await loadTokens();
        // Tries a silent refresh first when the access token has expired —
        // only a genuinely dead/missing refresh token counts as logged out.
        loggedIn = await ensureValidSession();
        if (!loggedIn && getAccessToken()) {
          await clearTokens();
        }
      } catch (error) {
        console.warn('[Splash] session check failed:', error?.message || error);
      }

      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt));
      await new Promise(resolve => setTimeout(resolve, wait));
      if (cancelled) {
        return;
      }

      if (loggedIn) {
        // Backend wants a device upsert on every launch; best-effort.
        registerDeviceForPush();
        navigation.replace('MainTabs');
      } else {
        navigation.replace('Login');
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return (
    <ImageBackground
      source={require('../assets/images/splashSpace.jpg')}
      style={styles.background}
      resizeMode="cover">
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      <View style={styles.overlay} />
      <View style={styles.content}>
        <Image
          source={require('../assets/images/appIcon.png')}
          style={styles.icon}
          resizeMode="contain"
        />
        <Text style={styles.appName}>trickle</Text>
        <Text style={styles.tagline}>SUPPORT CONSOLE</Text>
        <ActivityIndicator
          size="small"
          color={colors.onDark}
          style={styles.loader}
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {flex: 1, backgroundColor: colors.surface},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 13, 13, 0.38)',
  },
  content: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  icon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    overflow: 'hidden',
  },
  appName: {
    color: colors.onDark,
    fontFamily: fonts.display,
    fontSize: 30,
    marginTop: 18,
  },
  tagline: {
    color: colors.orangeLight,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 2.3,
    marginTop: 8,
  },
  loader: {marginTop: 28},
});
