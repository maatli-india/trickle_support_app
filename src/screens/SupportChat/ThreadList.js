import React, {useCallback, useRef, useState} from 'react';
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
import {RotateCw} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {
  listSupportThreads,
  SUPPORT_THREAD_STATUSES,
  SUPPORT_THREADS_PAGE_SIZE,
} from '../../api/supportChat';
import ScreenHeader from '../../components/ScreenHeader';
import ListRow from '../../components/ListRow';
import StatusPill from '../../components/StatusPill';
import ChipSelect from '../../components/ChipSelect';
import Loader from '../../components/Loader';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {formatRelative} from '../../utils/format';
import {getThreadStatusMeta, THREAD_STATUS_META, threadTitle} from './status';

const ALL = '';
const FILTER_OPTIONS = [
  {value: 'open', label: THREAD_STATUS_META.open.label},
  ...SUPPORT_THREAD_STATUSES.filter(s => s !== 'open').map(s => ({
    value: s,
    label: THREAD_STATUS_META[s].label,
  })),
  {value: ALL, label: 'All'},
];

const ThreadRight = ({thread}) => (
  <View style={styles.right}>
    <StatusPill meta={getThreadStatusMeta(thread.status)} size="sm" />
    <Text style={styles.time} numberOfLines={1}>
      {formatRelative(thread.lastMessageAt || thread.createdAt)}
    </Text>
  </View>
);

export default function SupportChatListScreen({navigation}) {
  // Default to the open queue — that's what needs a reply.
  const [status, setStatus] = useState('open');
  const [threads, setThreads] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Each fetch gets a token; responses for a superseded request are dropped.
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
        const res = await listSupportThreads({
          status,
          page: 1,
          limit: SUPPORT_THREADS_PAGE_SIZE,
        });
        if (id !== requestId.current) {
          return;
        }
        const items = res?.items || [];
        if (mode === 'silent' && pageRef.current > 1) {
          // Back from a thread with more than page 1 loaded: refresh the top
          // in place and keep the tail so the scroll position survives.
          setThreads(current => {
            const fresh = new Set(items.map(t => t.id));
            return [...items, ...current.filter(t => !fresh.has(t.id))];
          });
        } else {
          setThreads(items);
          setPage(1);
        }
        setTotal(Number(res?.total) || 0);
        setError(null);
      } catch (err) {
        if (id === requestId.current && !isUnauthorizedError(err)) {
          setError(err?.message || 'Could not load support chats.');
        }
      } finally {
        if (id === requestId.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [status],
  );

  // First focus, every return (e.g. back from a thread), and filter changes.
  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage]),
  );

  const onChangeFilter = value => {
    if (value === status) {
      return;
    }
    requestId.current++;
    setThreads([]);
    setTotal(0);
    setPage(1);
    pageRef.current = 1;
    setError(null);
    setInitialLoading(true);
    setStatus(value);
  };

  const hasMore = threads.length < total;

  const loadMore = async () => {
    if (!hasMore || loadingMore || initialLoading || refreshing) {
      return;
    }
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const res = await listSupportThreads({
        status,
        page: page + 1,
        limit: SUPPORT_THREADS_PAGE_SIZE,
      });
      if (id !== requestId.current) {
        return;
      }
      setThreads(current => {
        const seen = new Set(current.map(t => t.id));
        return [...current, ...(res?.items || []).filter(t => !seen.has(t.id))];
      });
      setTotal(Number(res?.total) || 0);
      setPage(page + 1);
    } catch (err) {
      if (!isUnauthorizedError(err)) {
        console.warn('[SupportChat] load more failed:', err?.message);
      }
    } finally {
      setLoadingMore(false);
    }
  };

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
      return <Loader label="Loading support chats" style={styles.stateBox} />;
    }
    if (error) {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Couldn't load support chats</Text>
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
        <Text style={styles.stateTitle}>No support chats</Text>
        <Text style={styles.stateText}>
          {status ? 'Nothing with this status right now.' : 'No user has started a chat yet.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={workhorse.surface} />
      <ScreenHeader lightTheme subtitle="Support chat" />
      <FlatList
        data={threads}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <ListRow
            title={threadTitle(item)}
            subtitle={item.lastMessagePreview || 'No messages yet'}
            meta={item.role ? `Opened as ${item.role}` : undefined}
            right={<ThreadRight thread={item} />}
            onPress={() => navigation.navigate('SupportChatThread', {threadId: item.id})}
            accessibilityLabel={`${threadTitle(item)}, ${getThreadStatusMeta(item.status).label}`}
          />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.footer} color={workhorse.muted} /> : null
        }
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadFirstPage({mode: 'refresh'})}
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
  right: {alignItems: 'flex-end', gap: spacing.xs + 2},
  time: {fontFamily: fonts.body, fontSize: 11, color: workhorse.muted},
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
  footer: {paddingVertical: spacing.lg},
  pressed: {opacity: 0.68},
});
