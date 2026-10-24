import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {RotateCw, UserRound} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {listReports, REPORTS_PAGE_SIZE} from '../../api/reports';
import {getUnreadNotificationCount} from '../../api/notifications';
import {resolveUserNames} from '../../api/users';
import ScreenHeader from '../../components/ScreenHeader';
import NotificationBell from '../../components/NotificationBell';
import ListRow from '../../components/ListRow';
import StatusPill, {REPORT_STATUS_META, REPORT_STATUSES} from '../../components/StatusPill';
import ChipSelect from '../../components/ChipSelect';
import Loader from '../../components/Loader';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {formatRelative, humanize, parseDate} from '../../utils/format';

const ALL = '';
const FILTER_OPTIONS = [
  {value: ALL, label: 'All'},
  ...REPORT_STATUSES.map(status => ({
    value: status,
    label: REPORT_STATUS_META[status].label,
  })),
];

// `route.params.initialStatus` (set by the Home dashboard's stat cards) →
// a valid filter value; anything unknown falls back to All.
const toFilter = value => (REPORT_STATUSES.includes(value) ? value : ALL);

const OPEN_STATUSES = ['submitted', 'under_review'];

const isOverdue = report =>
  OPEN_STATUSES.includes(report.status) &&
  (parseDate(report.slaDueAt)?.getTime() ?? Infinity) < Date.now();

const ReportTitle = ({report}) => (
  <View style={styles.titleRow}>
    {report.urgent && <View style={styles.urgentDot} />}
    <Text style={styles.rowTitle} numberOfLines={1}>
      {humanize(report.category) || 'Report'}
    </Text>
    {report.urgent && <Text style={styles.urgentLabel}>URGENT</Text>}
  </View>
);

// `reporterName`: undefined = still resolving, null = unknown/failed.
const reporterLabel = (report, reporterName) => {
  if (!report.reporterId || reporterName === null) {
    return 'Reporter unknown';
  }
  return reporterName === undefined ? 'Loading reporter…' : reporterName;
};

// Footer: reporter on the left, recency (+ SLA overdue) on the right.
const ReportMeta = ({report, reporterName}) => {
  const resolved = !!report.reporterId && !!reporterName;
  return (
    <View style={styles.metaRow}>
      <View style={styles.reporter}>
        <UserRound size={13} color={workhorse.muted} />
        <Text
          style={[styles.reporterName, !resolved && styles.reporterPending]}
          numberOfLines={1}>
          {reporterLabel(report, reporterName)}
        </Text>
      </View>
      <Text style={styles.rowMeta} numberOfLines={1}>
        {formatRelative(report.createdAt)}
        {isOverdue(report) && <Text style={styles.overdue}>{'  ·  SLA overdue'}</Text>}
      </Text>
    </View>
  );
};

export default function ReportsScreen({navigation, route}) {
  const [status, setStatus] = useState(() => toFilter(route.params?.initialStatus));
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // {[reporterId]: name|null} — filled in after each page renders.
  const [reporterNames, setReporterNames] = useState({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Fire-and-forget: resolve the reporters on a freshly loaded page without
  // holding up the list. Rows show a placeholder until this lands; the
  // shared cache in api/users makes repeat ids (and refreshes) free.
  const loadReporterNames = useCallback(async items => {
    const ids = items.map(r => r.reporterId).filter(Boolean);
    if (!ids.length) {
      return;
    }
    const names = await resolveUserNames(ids);
    if (mounted.current) {
      setReporterNames(current => ({...current, ...names}));
    }
  }, []);

  // Each fetch gets a token; a response for a superseded request (filter
  // changed mid-flight) is dropped.
  const requestId = useRef(0);
  const pageRef = useRef(1);
  pageRef.current = page;

  const loadFirstPage = useCallback(
    async ({mode = 'silent'} = {}) => {
      const id = ++requestId.current;
      if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const res = await listReports({status, page: 1, limit: REPORTS_PAGE_SIZE});
        if (id !== requestId.current) {
          return;
        }
        const items = res?.items || [];
        if (mode === 'silent' && pageRef.current > 1) {
          // Returning to a list scrolled past page 1: refresh the top in
          // place and keep the already-loaded tail, so the user's scroll
          // position isn't thrown away.
          setReports(current => {
            const fresh = new Set(items.map(r => r.id));
            return [...items, ...current.filter(r => !fresh.has(r.id))];
          });
        } else {
          setReports(items);
          setPage(1);
        }
        setTotal(Number(res?.total) || 0);
        setError(null);
        loadReporterNames(items);
      } catch (err) {
        if (id === requestId.current && !isUnauthorizedError(err)) {
          setError(err?.message || 'Could not load reports.');
        }
      } finally {
        if (id === requestId.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [status, loadReporterNames],
  );

  const loadUnreadCount = useCallback(async () => {
    try {
      setUnreadCount(await getUnreadNotificationCount());
    } catch (_) {
      // Badge is best-effort.
    }
  }, []);

  // Runs on first focus, on every return to this screen, and whenever the
  // filter changes (loadFirstPage's identity changes with `status`).
  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
      loadUnreadCount();
    }, [loadFirstPage, loadUnreadCount]),
  );

  const onChangeFilter = value => {
    if (value === status) {
      return;
    }
    requestId.current++; // drop any in-flight page for the old filter
    setReports([]);
    setTotal(0);
    setPage(1);
    pageRef.current = 1;
    setError(null);
    setInitialLoading(true);
    setStatus(value);
  };

  // The Home dashboard deep-links here with
  // navigate('ReportsTab', {screen: 'Reports', params: {initialStatus}}).
  // Each such navigate hands us a fresh params object, so re-apply the
  // requested filter whenever it changes — even if this screen was already
  // mounted (tab visited before) or the same card is tapped twice.
  const onChangeFilterRef = useRef(onChangeFilter);
  onChangeFilterRef.current = onChangeFilter;
  const params = route.params;
  useEffect(() => {
    if (params && 'initialStatus' in params) {
      onChangeFilterRef.current(toFilter(params.initialStatus));
    }
  }, [params]);

  const hasMore = reports.length < total;

  const loadMore = async () => {
    if (!hasMore || loadingMore || initialLoading || refreshing) {
      return;
    }
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const res = await listReports({status, page: page + 1, limit: REPORTS_PAGE_SIZE});
      if (id !== requestId.current) {
        return;
      }
      const seen = new Set(reports.map(r => r.id));
      const items = res?.items || [];
      setReports(current => [
        ...current,
        ...items.filter(r => !seen.has(r.id)),
      ]);
      setTotal(Number(res?.total) || 0);
      setPage(page + 1);
      loadReporterNames(items);
    } catch (err) {
      if (!isUnauthorizedError(err)) {
        console.warn('[Reports] load more failed:', err?.message);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const bell = (
    <NotificationBell
      unreadCount={unreadCount}
      onPress={() => navigation.navigate('Notifications')}
    />
  );

  const listHeader = (
    <View>
      <ChipSelect
        scroll
        options={FILTER_OPTIONS}
        value={status}
        onChange={onChangeFilter}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}
      />
    </View>
  );

  const renderEmpty = () => {
    if (initialLoading) {
      return <Loader label="Loading reports" style={styles.stateBox} />;
    }
    if (error) {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Couldn't load reports</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable
            onPress={() => {
              setInitialLoading(true);
              loadFirstPage();
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
      <View style={styles.stateBox}>
        <Text style={styles.stateTitle}>No reports</Text>
        <Text style={styles.stateText}>
          {status ? 'Nothing with this status right now.' : 'The queue is empty.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={workhorse.surface} />
      <ScreenHeader lightTheme subtitle="Support console" rightContent={bell} />
      <FlatList
        data={reports}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <ListRow
            style={styles.reportRow}
            title={<ReportTitle report={item} />}
            subtitle={
              <Text style={styles.description} numberOfLines={2}>
                {item.description || `${item.reportedType} · ${item.reportedId || '—'}`}
              </Text>
            }
            meta={
              <ReportMeta report={item} reporterName={reporterNames[item.reporterId]} />
            }
            right={<StatusPill status={item.status} size="sm" />}
            onPress={() => navigation.navigate('ReportDetail', {reportId: item.id})}
            accessibilityLabel={[
              `${humanize(item.category) || 'Report'} report`,
              item.urgent ? 'urgent' : null,
              REPORT_STATUS_META[item.status]?.label,
              reporterNames[item.reporterId] ? `by ${reporterNames[item.reporterId]}` : null,
              formatRelative(item.createdAt),
            ]
              .filter(Boolean)
              .join(', ')}
          />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} color={workhorse.muted} />
          ) : null
        }
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              loadFirstPage({mode: 'refresh'});
              loadUnreadCount();
            }}
            tintColor={workhorse.muted}
            colors={[workhorse.ink]}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: workhorse.background},
  listContent: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl},
  filters: {marginTop: spacing.md, marginHorizontal: -spacing.lg},
  filtersContent: {paddingHorizontal: spacing.lg, paddingBottom: spacing.lg},
  // Top-align the status pill with the title on the taller 3-part card.
  reportRow: {alignItems: 'flex-start', paddingVertical: spacing.md + 4},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  urgentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: workhorse.danger,
  },
  rowTitle: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: workhorse.ink,
  },
  urgentLabel: {
    fontFamily: fonts.label,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: workhorse.dangerDeep,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.secondary,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: workhorse.divider,
  },
  reporter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    flexShrink: 1,
    minWidth: 0,
  },
  reporterName: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    fontWeight: '600',
    color: workhorse.inkSoft,
  },
  reporterPending: {fontWeight: '400', color: workhorse.muted, fontStyle: 'italic'},
  rowMeta: {
    flexShrink: 0,
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: workhorse.muted,
  },
  overdue: {color: workhorse.dangerDeep, fontWeight: '600'},
  stateBox: {alignItems: 'center', paddingVertical: spacing.xxl * 1.5},
  stateTitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '600',
    color: workhorse.ink,
  },
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
  footer: {paddingVertical: spacing.lg},
  pressed: {opacity: 0.68},
});
