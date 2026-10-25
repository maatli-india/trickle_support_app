import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
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
import {MessageCircle, RotateCw, UserRound} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {listReports} from '../../api/reports';
import {listSupportThreads} from '../../api/supportChat';
import {getUnreadNotificationCount} from '../../api/notifications';
import {resolveUserNames} from '../../api/users';
import ScreenHeader from '../../components/ScreenHeader';
import NotificationBell from '../../components/NotificationBell';
import ListRow from '../../components/ListRow';
import StatusPill, {getReportStatusMeta} from '../../components/StatusPill';
import ChipSelect from '../../components/ChipSelect';
import Loader from '../../components/Loader';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {formatRelative, humanize, parseDate} from '../../utils/format';
import {getThreadStatusMeta, threadTitle} from '../SupportChat/status';

// A single admin queue merging two backend entities that used to live on
// separate tabs:
//   - Report (filed via "Report a problem" / "Report a user")
//   - SupportThread (opened via the consumer app's per-request "Chat with
//     us" — never backed by a Report anymore, see ReportIssueFromRequest)
// A request-type report and its request's thread (same matchId) collapse
// into ONE row — the point of "Issues" is exactly that a request's report
// and its conversation are the same issue, not two unrelated list entries.
// Fetched unfiltered (capped at 100 each) and bucketed into a shared
// open/resolved/closed status client-side, since the two entities don't
// share a status vocabulary.

const ISSUES_PAGE_SIZE = 100;

const ALL = '';
const BUCKET_OPTIONS = [
  {value: ALL, label: 'All'},
  {value: 'open', label: 'Open'},
  {value: 'resolved', label: 'Resolved'},
  {value: 'closed', label: 'Closed'},
];

// `route.params.initialStatus` (Home's stat cards) → a valid bucket.
const toFilter = value => (BUCKET_OPTIONS.some(o => o.value === value) ? value : ALL);

const REPORT_BUCKET = {
  submitted: 'open',
  under_review: 'open',
  resolved: 'resolved',
  closed_no_action: 'closed',
};
const THREAD_BUCKET = {open: 'open', resolved: 'resolved', closed: 'closed'};

/** Report's bucket takes precedence when an issue has both — it's the "official" status. */
const issueBucket = issue =>
  (issue.report && REPORT_BUCKET[issue.report.status]) ||
  (issue.thread && THREAD_BUCKET[issue.thread.status]) ||
  'open';

const issueActivityAt = issue => {
  const times = [
    issue.report?.updatedAt,
    issue.thread?.lastMessageAt,
    issue.thread?.createdAt,
  ]
    .map(v => parseDate(v)?.getTime())
    .filter(Boolean);
  return times.length ? Math.max(...times) : 0;
};

/** Merge reports + threads into one list, grouping a request-type report with its own request's thread. */
const mergeIssues = (reports, threads) => {
  const byKey = new Map();
  const keyFor = (reportedType, reportedId) =>
    reportedType === 'request' && reportedId ? `match:${reportedId}` : null;

  reports.forEach(report => {
    const key = keyFor(report.reportedType, report.reportedId) || `report:${report.id}`;
    byKey.set(key, {...(byKey.get(key) || {}), id: key, report});
  });
  threads.forEach(thread => {
    const key = thread.matchId ? `match:${thread.matchId}` : `thread:${thread.id}`;
    byKey.set(key, {...(byKey.get(key) || {}), id: key, thread});
  });

  return [...byKey.values()].sort((a, b) => issueActivityAt(b) - issueActivityAt(a));
};

const IssueTitle = ({issue}) => (
  <View style={styles.titleRow}>
    {issue.report?.urgent && <View style={styles.urgentDot} />}
    <Text style={styles.rowTitle} numberOfLines={1}>
      {issue.report ? humanize(issue.report.category) || 'Report' : threadTitle(issue.thread)}
    </Text>
    {issue.report?.urgent && <Text style={styles.urgentLabel}>URGENT</Text>}
    {!!issue.report && !!issue.thread && <MessageCircle size={13} color={workhorse.muted} />}
  </View>
);

// `name`: undefined = still resolving, null = unknown/failed.
const personLabel = (userId, name) => {
  if (!userId) {
    return 'No reporter recorded';
  }
  if (name === null) {
    return 'Reporter unknown';
  }
  return name === undefined ? 'Loading reporter…' : name;
};

const IssueMeta = ({issue, name}) => {
  const userId = issue.report?.reporterId || issue.thread?.userId;
  const resolved = !!userId && !!name;
  return (
    <View style={styles.metaRow}>
      <View style={styles.reporter}>
        <UserRound size={13} color={workhorse.muted} />
        <Text style={[styles.reporterName, !resolved && styles.reporterPending]} numberOfLines={1}>
          {personLabel(userId, name)}
        </Text>
      </View>
      <Text style={styles.rowMeta} numberOfLines={1}>
        {formatRelative(issueActivityAt(issue) || issue.report?.createdAt || issue.thread?.createdAt)}
      </Text>
    </View>
  );
};

export default function IssuesScreen({navigation, route}) {
  const [bucket, setBucket] = useState(() => toFilter(route.params?.initialStatus));
  const [issues, setIssues] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // {[userId]: name|null}
  const [names, setNames] = useState({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadNames = useCallback(async mergedIssues => {
    const ids = mergedIssues
      .map(issue => issue.report?.reporterId || issue.thread?.userId)
      .filter(Boolean);
    if (!ids.length) {
      return;
    }
    const resolvedNames = await resolveUserNames(ids);
    if (mounted.current) {
      setNames(current => ({...current, ...resolvedNames}));
    }
  }, []);

  const requestId = useRef(0);

  const load = useCallback(
    async ({mode = 'silent'} = {}) => {
      const id = ++requestId.current;
      if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const [reportsRes, threadsRes] = await Promise.all([
          listReports({limit: ISSUES_PAGE_SIZE}),
          listSupportThreads({limit: ISSUES_PAGE_SIZE}),
        ]);
        if (id !== requestId.current) {
          return;
        }
        const merged = mergeIssues(reportsRes?.items || [], threadsRes?.items || []);
        setIssues(merged);
        setError(null);
        loadNames(merged);
      } catch (err) {
        if (id === requestId.current && !isUnauthorizedError(err)) {
          setError(err?.message || 'Could not load issues.');
        }
      } finally {
        if (id === requestId.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [loadNames],
  );

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

  const onChangeFilter = value => setBucket(value);

  // Home dashboard deep-links here with
  // navigate('IssuesTab', {screen: 'Issues', params: {initialStatus}}).
  const onChangeFilterRef = useRef(onChangeFilter);
  onChangeFilterRef.current = onChangeFilter;
  const params = route.params;
  useEffect(() => {
    if (params && 'initialStatus' in params) {
      onChangeFilterRef.current(toFilter(params.initialStatus));
    }
  }, [params]);

  const visibleIssues = bucket ? issues.filter(issue => issueBucket(issue) === bucket) : issues;

  const bell = (
    <NotificationBell unreadCount={unreadCount} onPress={() => navigation.navigate('Notifications')} />
  );

  const listHeader = (
    <View>
      <ChipSelect
        scroll
        options={BUCKET_OPTIONS}
        value={bucket}
        onChange={onChangeFilter}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}
      />
    </View>
  );

  const renderEmpty = () => {
    if (initialLoading) {
      return <Loader label="Loading issues" style={styles.stateBox} />;
    }
    if (error) {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Couldn't load issues</Text>
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
      <View style={styles.stateBox}>
        <Text style={styles.stateTitle}>No issues</Text>
        <Text style={styles.stateText}>
          {bucket ? 'Nothing with this status right now.' : 'The queue is empty.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={workhorse.surface} />
      <ScreenHeader lightTheme subtitle="Support console" rightContent={bell} />
      <FlatList
        data={visibleIssues}
        keyExtractor={item => item.id}
        renderItem={({item}) => {
          const userId = item.report?.reporterId || item.thread?.userId;
          const statusMeta = item.report
            ? getReportStatusMeta(item.report.status)
            : getThreadStatusMeta(item.thread.status);
          return (
            <ListRow
              style={styles.issueRow}
              title={<IssueTitle issue={item} />}
              subtitle={
                <Text style={styles.description} numberOfLines={2}>
                  {item.report?.description || item.thread?.lastMessagePreview || 'No messages yet'}
                </Text>
              }
              meta={<IssueMeta issue={item} name={names[userId]} />}
              right={<StatusPill meta={statusMeta} size="sm" />}
              onPress={() =>
                item.report
                  ? navigation.navigate('ReportDetail', {reportId: item.report.id})
                  : navigation.navigate('SupportChatThread', {threadId: item.thread.id})
              }
              accessibilityLabel={[
                item.report ? humanize(item.report.category) || 'Report' : threadTitle(item.thread),
                statusMeta.label,
                names[userId] ? `by ${names[userId]}` : null,
              ]
                .filter(Boolean)
                .join(', ')}
            />
          );
        }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
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
  issueRow: {alignItems: 'flex-start', paddingVertical: spacing.md + 4},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  urgentDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: workhorse.danger},
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
  reporter: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1, flexShrink: 1, minWidth: 0},
  reporterName: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    fontWeight: '600',
    color: workhorse.inkSoft,
  },
  reporterPending: {fontWeight: '400', color: workhorse.muted, fontStyle: 'italic'},
  rowMeta: {flexShrink: 0, fontFamily: fonts.body, fontSize: 11.5, color: workhorse.muted},
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
