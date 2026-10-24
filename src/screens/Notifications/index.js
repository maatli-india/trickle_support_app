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
import {Bell, CheckCheck, FileWarning, MessageCircle, RotateCw} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {
  isNotificationUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_PAGE_SIZE,
} from '../../api/notifications';
import {getNotificationTarget} from '../../notifications/routing';
import ScreenHeader from '../../components/ScreenHeader';
import ListRow from '../../components/ListRow';
import Loader from '../../components/Loader';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {formatRelative} from '../../utils/format';

const NOW_READ = () => new Date().toISOString();

const EntityIcon = ({notification, unread}) => {
  const target = getNotificationTarget(notification);
  const Icon =
    target?.kind === 'report'
      ? FileWarning
      : target?.kind === 'supportThread'
      ? MessageCircle
      : Bell;
  return (
    <View style={[styles.iconWrap, unread && styles.iconWrapUnread]}>
      <Icon size={18} color={unread ? workhorse.ink : workhorse.muted} />
      {unread && <View style={styles.unreadDot} />}
    </View>
  );
};

export default function NotificationsScreen({navigation}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const loadFirstPage = useCallback(async ({mode = 'silent'} = {}) => {
    const id = ++requestId.current;
    if (mode === 'refresh') {
      setRefreshing(true);
    }
    try {
      const res = await listNotifications({page: 1, limit: NOTIFICATIONS_PAGE_SIZE});
      if (id !== requestId.current) {
        return;
      }
      setItems(res?.items || []);
      setTotal(Number(res?.total) || 0);
      setPage(1);
      setError(null);
    } catch (err) {
      if (id === requestId.current && !isUnauthorizedError(err)) {
        setError(err?.message || 'Could not load notifications.');
      }
    } finally {
      if (id === requestId.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage]),
  );

  const hasMore = items.length < total;

  const loadMore = async () => {
    if (!hasMore || loadingMore || initialLoading || refreshing) {
      return;
    }
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const res = await listNotifications({page: page + 1, limit: NOTIFICATIONS_PAGE_SIZE});
      if (id !== requestId.current) {
        return;
      }
      setItems(current => {
        const seen = new Set(current.map(n => n.id));
        return [...current, ...(res?.items || []).filter(n => !seen.has(n.id))];
      });
      setTotal(Number(res?.total) || 0);
      setPage(page + 1);
    } catch (err) {
      if (!isUnauthorizedError(err)) {
        console.warn('[Notifications] load more failed:', err?.message);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const onPressRow = notification => {
    if (isNotificationUnread(notification)) {
      // Optimistic; a failed mark-read only means it stays bold next refresh.
      setItems(current =>
        current.map(n => (n.id === notification.id ? {...n, readAt: NOW_READ()} : n)),
      );
      markNotificationRead(notification.id).catch(err => {
        if (!isUnauthorizedError(err)) {
          console.warn('[Notifications] mark read failed:', err?.message);
        }
      });
    }
    const target = getNotificationTarget(notification);
    if (target?.kind === 'report') {
      navigation.push('ReportDetail', {reportId: target.id});
    } else if (target?.kind === 'supportThread') {
      navigation.push('SupportChatThread', {threadId: target.id});
    }
    // unknown: marking read is the only action.
  };

  const unreadCount = items.filter(isNotificationUnread).length;

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      const now = NOW_READ();
      setItems(current => current.map(n => (isNotificationUnread(n) ? {...n, readAt: now} : n)));
    } catch (err) {
      if (!isUnauthorizedError(err)) {
        setError(err?.message || 'Could not mark all as read.');
      }
    } finally {
      setMarkingAll(false);
    }
  };

  const listHeader = (
    <View style={styles.listHeader}>
      {unreadCount > 0 && (
        <Pressable
          onPress={markAll}
          disabled={markingAll}
          style={({pressed}) => [styles.markAll, (pressed || markingAll) && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Mark all as read">
          {markingAll ? (
            <ActivityIndicator size="small" color={workhorse.inkSoft} />
          ) : (
            <CheckCheck size={14} color={workhorse.inkSoft} />
          )}
          <Text style={styles.markAllText}>Mark all read</Text>
        </Pressable>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (initialLoading) {
      return <Loader label="Loading notifications" style={styles.stateBox} />;
    }
    if (error) {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Couldn't load notifications</Text>
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
        <Text style={styles.stateTitle}>No notifications</Text>
        <Text style={styles.stateText}>New reports and support threads show up here.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={workhorse.surface} />
      <ScreenHeader lightTheme showBack navigation={navigation} subtitle="Notifications" />
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({item}) => {
          const unread = isNotificationUnread(item);
          return (
            <ListRow
              left={<EntityIcon notification={item} unread={unread} />}
              title={
                <Text
                  style={[styles.rowTitle, unread && styles.rowTitleUnread]}
                  numberOfLines={1}>
                  {item.title || 'Notification'}
                </Text>
              }
              subtitle={item.body}
              meta={formatRelative(item.createdAt)}
              onPress={() => onPressRow(item)}
              showChevron={['report', 'supportThread'].includes(
                getNotificationTarget(item)?.kind,
              )}
              style={!unread && styles.readRow}
              accessibilityLabel={`${unread ? 'Unread: ' : ''}${item.title || 'Notification'}`}
            />
          );
        }}
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
  listHeader: {marginTop: spacing.md, marginBottom: spacing.lg, alignItems: 'flex-end'},
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: workhorse.border,
    backgroundColor: workhorse.surface,
  },
  markAllText: {fontFamily: fonts.body, fontSize: 12.5, color: workhorse.inkSoft},
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: workhorse.neutralSurface,
  },
  iconWrapUnread: {backgroundColor: workhorse.warningSurface},
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: workhorse.surface,
    backgroundColor: workhorse.danger,
  },
  rowTitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '400',
    color: workhorse.inkSoft,
  },
  rowTitleUnread: {fontWeight: '700', color: workhorse.ink},
  readRow: {backgroundColor: workhorse.surfaceMuted},
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
