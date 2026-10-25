import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {
  ChevronRight,
  CircleCheck,
  FileWarning,
  Inbox,
  RotateCw,
} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {getOverviewStats, listReports} from '../../api/reports';
import {getUnreadNotificationCount} from '../../api/notifications';
import ScreenHeader from '../../components/ScreenHeader';
import NotificationBell from '../../components/NotificationBell';
import Loader from '../../components/Loader';
import {consumePendingNavigation} from '../../navigation/navigationRef';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';

const formatCount = value =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-IN')
    : '—';

/**
 * Report stats:
 *   total      — GET /v1/admin/reports?limit=1 → paged envelope `.total`
 *   unresolved — overview.reportsAwaitingReview (submitted + under_review)
 *   resolved   — total − unresolved (resolved + closed_no_action; there are
 *                only 4 report statuses)
 */
const loadDashboard = async () => {
  const [overview, reportsPage] = await Promise.all([
    getOverviewStats(),
    listReports({page: 1, limit: 1}),
  ]);
  const total = Number(reportsPage?.total) || 0;
  const unresolved = Number(overview?.reportsAwaitingReview) || 0;
  return {
    total,
    unresolved,
    resolved: Math.max(0, total - unresolved),
    totalUsers: Number(overview?.totalUsers) || 0,
    totalParcelRequests: Number(overview?.totalParcelRequests) || 0,
    totalTripsPosted: Number(overview?.totalTripsPosted) || 0,
  };
};

const StatCard = ({label, hint, value, Icon, tone, onPress}) => (
  <Pressable
    onPress={onPress}
    style={({pressed}) => [styles.statCard, pressed && styles.pressed]}
    accessibilityRole="button"
    accessibilityLabel={`${label}: ${formatCount(value)}. ${hint}`}>
    <View style={[styles.statIcon, {backgroundColor: tone.surface}]}>
      <Icon size={16} color={tone.ink} />
    </View>
    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
      {formatCount(value)}
    </Text>
    <Text style={styles.statLabel} numberOfLines={1}>
      {label}
    </Text>
    <View style={styles.statHintRow}>
      <Text style={styles.statHint} numberOfLines={1}>
        {hint}
      </Text>
      <ChevronRight size={12} color={workhorse.muted} />
    </View>
  </Pressable>
);

const MiniStat = ({label, value}) => (
  <View style={styles.miniStat}>
    <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit>
      {formatCount(value)}
    </Text>
    <Text style={styles.miniLabel} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

export default function HomeScreen({navigation}) {
  const [stats, setStats] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const requestId = useRef(0);

  // A tapped push notification that arrived before we were past
  // Splash/Login is parked in navigationRef. Home is the tab navigator's
  // initial tab, so it's the first session screen to mount — open it now
  // (pushed onto the Home tab's own stack).
  useEffect(() => {
    const pending = consumePendingNavigation();
    if (pending) {
      navigation.push(pending.name, pending.params);
    }
  }, [navigation]);

  const load = useCallback(async ({mode = 'silent'} = {}) => {
    const id = ++requestId.current;
    if (mode === 'refresh') {
      setRefreshing(true);
    }
    try {
      const next = await loadDashboard();
      if (id !== requestId.current) {
        return;
      }
      setStats(next);
      setError(null);
    } catch (err) {
      if (id === requestId.current && !isUnauthorizedError(err)) {
        setError(err?.message || 'Could not load stats.');
      }
    } finally {
      if (id === requestId.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadUnreadCount = useCallback(async () => {
    try {
      setUnreadCount(await getUnreadNotificationCount());
    } catch (_) {
      // Badge is best-effort.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadUnreadCount();
    }, [load, loadUnreadCount]),
  );

  // Cross-tab: land on the Issues tab's root screen with a filter applied.
  // `initialStatus: ''` explicitly resets the filter to All. Issues' own
  // bucket values are 'open'/'resolved'/'closed' (not Report's raw
  // 'submitted'/'resolved' statuses) — see screens/Issues/index.js.
  const openReports = initialStatus =>
    navigation.navigate('IssuesTab', {
      screen: 'Issues',
      params: {initialStatus},
    });

  const bell = (
    <NotificationBell
      unreadCount={unreadCount}
      onPress={() => navigation.navigate('Notifications')}
    />
  );

  const renderBody = () => {
    if (initialLoading && !stats) {
      return <Loader label="Loading stats" style={styles.stateBox} />;
    }
    if (error && !stats) {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Couldn't load stats</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable
            onPress={() => {
              setInitialLoading(true);
              load();
            }}
            style={({pressed}) => [styles.retryButton, pressed && styles.pressed]}
            accessibilityRole="button">
            <RotateCw size={14} color={workhorse.surface} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <>
        <Text style={styles.sectionLabel}>ISSUES</Text>
        <View style={styles.statGrid}>
          <StatCard
            label="Total"
            hint="All reports"
            value={stats?.total}
            Icon={Inbox}
            tone={{surface: workhorse.infoSurface, ink: workhorse.info}}
            onPress={() => openReports('')}
          />
          <StatCard
            label="Unresolved"
            hint="Submitted"
            value={stats?.unresolved}
            Icon={FileWarning}
            tone={{surface: workhorse.warningSurface, ink: workhorse.warningInk}}
            onPress={() => openReports('open')}
          />
          <StatCard
            label="Resolved"
            hint="Resolved"
            value={stats?.resolved}
            Icon={CircleCheck}
            tone={{surface: workhorse.successSurface, ink: workhorse.successInk}}
            onPress={() => openReports('resolved')}
          />
        </View>

        <Text style={styles.sectionLabel}>PLATFORM</Text>
        <View style={styles.miniRow}>
          <MiniStat label="Users" value={stats?.totalUsers} />
          <View style={styles.miniDivider} />
          <MiniStat label="Parcel requests" value={stats?.totalParcelRequests} />
          <View style={styles.miniDivider} />
          <MiniStat label="Trips posted" value={stats?.totalTripsPosted} />
        </View>
        {!!error && (
          <Text style={styles.staleText}>Couldn't refresh — showing last loaded stats.</Text>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={workhorse.surface} />
      <ScreenHeader lightTheme subtitle="Support console" rightContent={bell} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              load({mode: 'refresh'});
              loadUnreadCount();
            }}
            tintColor={workhorse.muted}
            colors={[workhorse.ink]}
          />
        }>
        {renderBody()}
      </ScrollView>
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
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  statGrid: {flexDirection: 'row', gap: spacing.sm},
  statCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: workhorse.border,
    backgroundColor: workhorse.surface,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: workhorse.ink,
    marginTop: spacing.md,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    fontWeight: '600',
    color: workhorse.ink,
    marginTop: 2,
  },
  statHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.xs,
  },
  statHint: {flexShrink: 1, fontFamily: fonts.body, fontSize: 11, color: workhorse.muted},
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: workhorse.border,
    backgroundColor: workhorse.surfaceMuted,
  },
  miniStat: {flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs},
  miniDivider: {width: 1, alignSelf: 'stretch', backgroundColor: workhorse.divider},
  miniValue: {fontFamily: fonts.body, fontSize: 16, fontWeight: '600', color: workhorse.inkSoft},
  miniLabel: {fontFamily: fonts.body, fontSize: 11, color: workhorse.muted, marginTop: 2},
  staleText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: workhorse.dangerDeep,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  stateBox: {alignItems: 'center', paddingVertical: spacing.xxl * 1.5},
  stateTitle: {fontFamily: fonts.body, fontSize: 16, fontWeight: '600', color: workhorse.ink},
  stateText: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: workhorse.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: workhorse.ink,
  },
  retryText: {fontFamily: fonts.body, fontSize: 14, color: workhorse.surface},
  pressed: {opacity: 0.68},
});
