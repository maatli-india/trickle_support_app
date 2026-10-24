import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import TrickleLogo from '../components/TrickleLogo';
import colors from '../constants/colors';
import fonts from '../constants/fonts';
import radius from '../constants/radius';
import spacing from '../constants/spacing';
import {adminLogin} from '../api/auth';
import {registerDeviceForPush} from '../notifications/push';

const getErrorMessage = error => {
  if (error?.status === 401) {
    return 'Incorrect username or password.';
  }
  return (
    error?.data?.message ||
    error?.data?.error ||
    error?.message ||
    'Login failed. Please try again.'
  );
};

export default function LoginScreen({navigation}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);

  const handleLogin = async () => {
    if (loading) {
      return;
    }
    const trimmed = username.trim();
    const nextErrors = {};
    if (!trimmed) {
      nextErrors.username = 'Enter your username.';
    }
    if (!password) {
      nextErrors.password = 'Enter your password.';
    }
    setFieldErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) {
      return;
    }

    setLoading(true);
    try {
      await adminLogin(trimmed, password);
    } catch (error) {
      setFormError(getErrorMessage(error));
      setLoading(false);
      return;
    }

    // Best-effort — never blocks or fails the login.
    registerDeviceForPush();
    setLoading(false);
    setPassword('');
    navigation.replace('MainTabs');
  };

  const clearFieldError = key => {
    if (fieldErrors[key] || formError) {
      setFieldErrors(prev => ({...prev, [key]: undefined}));
      setFormError('');
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={Platform.OS === 'android'}
      />
      <ImageBackground
        accessible={false}
        source={require('../assets/images/packageDelivery/world.jpg')}
        style={styles.backgroundArt}
        resizeMode="cover">
        <View style={styles.backgroundOverlay} />
      </ImageBackground>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <TrickleLogo lightTheme={false} size={40} />
              <Text style={styles.tagline}>SUPPORT CONSOLE</Text>
            </View>

            <View style={styles.authPanel}>
              <Text style={styles.panelTitle}>Staff sign in</Text>

              <Text style={styles.label}>USERNAME</Text>
              <TextInput
                style={[styles.input, fieldErrors.username && styles.inputError]}
                value={username}
                onChangeText={value => {
                  setUsername(value);
                  clearFieldError('username');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!loading}
              />
              {!!fieldErrors.username && (
                <Text style={styles.errorText}>{fieldErrors.username}</Text>
              )}

              <Text style={[styles.label, styles.labelSpaced]}>PASSWORD</Text>
              <TextInput
                ref={passwordRef}
                style={[styles.input, fieldErrors.password && styles.inputError]}
                value={password}
                onChangeText={value => {
                  setPassword(value);
                  clearFieldError('password');
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!loading}
              />
              {!!fieldErrors.password && (
                <Text style={styles.errorText}>{fieldErrors.password}</Text>
              )}

              {!!formError && (
                <Text style={[styles.errorText, styles.formError]}>
                  {formError}
                </Text>
              )}

              <Pressable
                onPress={handleLogin}
                disabled={loading}
                style={({pressed}) => [
                  styles.submitButton,
                  (pressed || loading) && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Sign in">
                {loading ? (
                  <ActivityIndicator color={colors.onDark} />
                ) : (
                  <Text style={styles.submitText}>Sign in</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// Visual language mirrors the consumer app's Login (src/screens/Login/styles.js):
// dark full-bleed art + overlay, translucent bordered auth panel, cream/coral
// brand-chrome tokens, inline error text under the field.
const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  flex: {flex: 1},
  safeArea: {flex: 1, backgroundColor: 'transparent'},
  backgroundArt: {...StyleSheet.absoluteFillObject, overflow: 'hidden'},
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 13, 13, 0.45)',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: spacing.xxl,
  },
  header: {alignItems: 'center', marginBottom: 40},
  tagline: {
    color: colors.orangeLight,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 2.3,
    marginTop: 10,
  },
  authPanel: {
    backgroundColor: 'rgba(13, 13, 13, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(248, 228, 181, 0.42)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  panelTitle: {
    color: colors.onDark,
    fontFamily: fonts.display,
    fontSize: 24,
    marginBottom: 20,
  },
  label: {
    color: colors.orangeLight,
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  labelSpaced: {marginTop: spacing.lg},
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(13, 13, 13, 0.4)',
    paddingHorizontal: 20,
    color: colors.onDark,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  inputError: {borderColor: colors.danger},
  errorText: {
    color: colors.danger,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  formError: {marginTop: spacing.md},
  submitButton: {
    height: 54,
    marginTop: spacing.xl,
    backgroundColor: colors.orange,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {opacity: 0.82},
  submitText: {color: colors.onDark, fontFamily: fonts.body, fontSize: 16},
});
