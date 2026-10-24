import React, {useState} from 'react';
import {Pressable, ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DeviceInfo from 'react-native-device-info';
import {ChevronRight, LogOut} from 'lucide-react-native';
import {logout} from '../../api/auth';
import ScreenHeader from '../../components/ScreenHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {resetToLogin} from '../../navigation/navigationRef';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import appConfig from '../../../app.json';

// app.json carries the name but no version; the native version/build
// (what the admin actually has installed) comes from DeviceInfo, same as
// the device-registration call in api/auth.js.
const appVersion = (() => {
  try {
    return `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`;
  } catch (_) {
    return '—';
  }
})();

const InfoRow = ({label, value, last}) => (
  <View style={[styles.infoRow, !last && styles.rowDivider]}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

export default function SettingsScreen() {
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = async () => {
    setConfirmLogout(false);
    await logout();
    // Reset the ROOT stack (via the root ref) — this screen lives inside a
    // nested tab stack, where navigation.reset would only reset that stack.
    resetToLogin();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={workhorse.surface} />
      <ScreenHeader lightTheme subtitle="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() => setConfirmLogout(true)}
            style={({pressed}) => [styles.actionRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Log out">
            <View style={styles.actionIcon}>
              <LogOut size={16} color={workhorse.dangerDeep} />
            </View>
            <Text style={styles.actionText}>Log out</Text>
            <ChevronRight size={16} color={workhorse.muted} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <InfoRow label="App" value={appConfig.displayName || appConfig.name} />
          <InfoRow label="Version" value={appVersion} last />
        </View>
      </ScrollView>
      <ConfirmModal
        visible={confirmLogout}
        title="Log out?"
        message="You'll need to sign in again to review reports."
        confirmLabel="Log out"
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
        destructive
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: workhorse.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl},
  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: workhorse.muted,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: workhorse.border,
    backgroundColor: workhorse.surface,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: workhorse.dangerSurface,
  },
  actionText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: workhorse.dangerDeep,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowDivider: {borderBottomWidth: 1, borderBottomColor: workhorse.divider},
  infoLabel: {fontFamily: fonts.body, fontSize: 14, color: workhorse.inkSoft},
  infoValue: {flexShrink: 1, fontFamily: fonts.body, fontSize: 14, color: workhorse.muted},
  pressed: {opacity: 0.68},
});
