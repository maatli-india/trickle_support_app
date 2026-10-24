import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import {ArrowLeft, FileText, MapPin, Send} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {
  connectAdminSupportChatWebSocket,
  fetchOlderSupportMessages,
  getSupportThread,
  sendSupportMessage,
  SUPPORT_HISTORY_PAGE_SIZE,
  updateSupportThread,
} from '../../api/supportChat';
import StatusPill from '../../components/StatusPill';
import ConfirmModal from '../../components/ConfirmModal';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {formatDateTime, parseDate} from '../../utils/format';
import {getThreadStatusMeta, threadTitle} from './status';

// Architecture copied from the consumer app's src/screens/Chat/index.js:
// socket only open while focused + foregrounded, reconnect with backoff only
// after a real open (a pre-open close is a rejection — fail immediately),
// history pagination via a "Load earlier messages" list header.
// Text messages only; file/location messages render as a placeholder row.

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000];

const STATUS_ACTIONS = {
  resolved: {
    label: 'Resolve',
    title: 'Resolve this chat?',
    message: 'Mark the issue as resolved. The user can still see the conversation.',
    destructive: false,
  },
  closed: {
    label: 'Close',
    title: 'Close this chat?',
    message: 'Close the thread without a resolution.',
    destructive: true,
  },
  open: {
    label: 'Reopen',
    title: 'Reopen this chat?',
    message: 'Move the thread back into the open queue.',
    destructive: false,
  },
};

const formatTime = value => {
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const mergeMessages = (current, incoming) => {
  const known = new Set(current.map(item => item.id));
  const added = incoming.filter(item => item?.id && !known.has(item.id));
  if (!added.length) {
    return current;
  }
  return [...current, ...added].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
};

export default function SupportChatThreadScreen({navigation, route}) {
  const threadId = route.params?.threadId;
  const isFocused = useIsFocused();

  const socketRef = useRef(null);
  const listRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  // Did THIS attempt get past the HTTP upgrade? A close before onOpen is a
  // rejection (thread not found, token rejected) — retrying won't help.
  const hasOpenedRef = useRef(false);
  const mountedRef = useRef(true);
  const oldestMessageIdRef = useRef(null);
  const canLoadMoreRef = useRef(true);
  // True while a support_fetch_history is in flight, so the next 'history'
  // frame is known to be an older page rather than the on-connect replay.
  const awaitingOlderRef = useRef(false);
  const initialHistoryRef = useRef(false);
  const lastMessageIdRef = useRef(null);
  // Bumped on every connect and every teardown. Handlers/promises from an
  // older generation are ignored — otherwise an intentional teardown's
  // onClose would schedule a reconnect, and a socket that finished opening
  // after the screen lost focus would be kept.
  const connectionGenRef = useRef(0);

  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingStatus, setPendingStatus] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // ── thread metadata (title, status, userId for bubble alignment) ──────────
  const loadThread = useCallback(async () => {
    if (!threadId) {
      return;
    }
    try {
      const res = await getSupportThread(threadId);
      if (mountedRef.current && res) {
        setThread(res);
      }
    } catch (err) {
      if (mountedRef.current && !isUnauthorizedError(err)) {
        console.warn('[SupportChat] load thread failed:', err?.message);
      }
    }
  }, [threadId]);

  useEffect(() => {
    if (isFocused) {
      loadThread();
    }
  }, [isFocused, loadThread]);

  // ── socket ────────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!threadId) {
      setLoading(false);
      setFatalError('No support thread to open.');
      return;
    }
    const gen = ++connectionGenRef.current;
    const isStale = () => !mountedRef.current || gen !== connectionGenRef.current;
    hasOpenedRef.current = false;
    awaitingOlderRef.current = false;
    connectAdminSupportChatWebSocket(threadId, {
      onOpen: () => {
        if (isStale()) {
          return;
        }
        hasOpenedRef.current = true;
        setConnected(true);
        setFatalError('');
        reconnectAttemptRef.current = 0;
      },
      onHistory: items => {
        if (isStale()) {
          return;
        }
        const isOlderPage = awaitingOlderRef.current;
        awaitingOlderRef.current = false;
        setMessages(current => mergeMessages(current, items));
        // A reconnect replays only the latest page; don't let it reset how
        // far back the admin has already paged.
        if (isOlderPage || !initialHistoryRef.current) {
          canLoadMoreRef.current = items.length >= SUPPORT_HISTORY_PAGE_SIZE;
        }
        initialHistoryRef.current = true;
        setLoading(false);
        setLoadingOlder(false);
      },
      onMessage: message => {
        if (isStale()) {
          return;
        }
        setMessages(current => mergeMessages(current, [message]));
      },
      onServerError: message => {
        if (isStale()) {
          return;
        }
        awaitingOlderRef.current = false;
        setLoading(false);
        setLoadingOlder(false);
        setNotice(message);
        console.warn('[SupportChat] server error', {threadId, message});
      },
      onClose: () => {
        if (isStale()) {
          return;
        }
        setConnected(false);
        socketRef.current = null;
        if (!hasOpenedRef.current) {
          setFatalError("This chat isn't available right now.");
          setLoading(false);
          return;
        }
        if (reconnectAttemptRef.current >= RECONNECT_DELAYS_MS.length) {
          setFatalError('Lost connection to chat.');
          setLoading(false);
          return;
        }
        const delay = RECONNECT_DELAYS_MS[reconnectAttemptRef.current];
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (!isStale()) {
            connect();
          }
        }, delay);
      },
      onError: () => {
        if (isStale()) {
          return;
        }
        setConnected(false);
      },
    })
      .then(ws => {
        if (isStale()) {
          ws.close();
          return;
        }
        socketRef.current = ws;
      })
      .catch(error => {
        if (isStale()) {
          return;
        }
        console.warn('[SupportChat] connect failed', {threadId, message: error?.message});
        setLoading(false);
        if (!isUnauthorizedError(error)) {
          setFatalError(error?.message || 'Could not connect to chat. Please try again.');
        }
      });
  }, [threadId]);

  const retryConnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    setFatalError('');
    setLoading(true);
    connect();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep the socket open only while this screen is what the admin is looking
  // at (focused AND app foregrounded); tear down otherwise and reconnect when
  // both hold again.
  const teardownSocket = useCallback(() => {
    connectionGenRef.current += 1;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    awaitingOlderRef.current = false;
    socketRef.current?.close();
    socketRef.current = null;
    setConnected(false);
    setLoadingOlder(false);
  }, []);

  useEffect(() => {
    const reconcile = () => {
      if (!mountedRef.current) {
        return;
      }
      const shouldBeConnected = isFocused && AppState.currentState === 'active';
      if (shouldBeConnected) {
        if (!socketRef.current) {
          reconnectAttemptRef.current = 0;
          setLoading(current => current || !initialHistoryRef.current);
          connect();
        }
      } else {
        teardownSocket();
      }
    };

    reconcile();
    const subscription = AppState.addEventListener('change', reconcile);
    return () => {
      subscription.remove();
      teardownSocket();
    };
  }, [isFocused, connect, teardownSocket]);

  // Track the oldest loaded message for paging, and scroll to the bottom
  // only when a NEW latest message arrives (not when older pages prepend).
  useEffect(() => {
    oldestMessageIdRef.current = messages[0]?.id || null;
    const lastId = messages[messages.length - 1]?.id || null;
    if (lastId && lastId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastId;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({animated: true}));
    }
  }, [messages]);

  // Server error notices are transient.
  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const loadOlderMessages = () => {
    if (loadingOlder || !connected || !canLoadMoreRef.current || !oldestMessageIdRef.current) {
      return;
    }
    setLoadingOlder(true);
    awaitingOlderRef.current = true;
    if (!fetchOlderSupportMessages(socketRef.current, oldestMessageIdRef.current)) {
      awaitingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  const sendMessage = () => {
    const text = draft.trim();
    const socket = socketRef.current;
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (sendSupportMessage(socket, text)) {
      setDraft('');
    }
  };

  // ── status actions ────────────────────────────────────────────────────────
  const confirmStatus = async () => {
    const status = pendingStatus;
    setPendingStatus(null);
    if (!status || !threadId) {
      return;
    }
    setUpdatingStatus(true);
    try {
      const updated = await updateSupportThread(threadId, {status});
      if (mountedRef.current && updated) {
        setThread(updated);
      }
    } catch (err) {
      if (mountedRef.current && !isUnauthorizedError(err)) {
        setNotice(err?.message || 'Could not update the chat status.');
      }
    } finally {
      if (mountedRef.current) {
        setUpdatingStatus(false);
      }
    }
  };

  const availableActions =
    !thread ? [] : thread.status === 'open' ? ['resolved', 'closed'] : ['open'];

  // ── rendering ─────────────────────────────────────────────────────────────
  const userId = thread?.userId;
  // Anything not sent by the thread's user came from the support side
  // (this admin or a colleague) → right-aligned.
  const isFromSupport = item => !!userId && String(item.senderId) !== String(userId);

  const renderMessageContent = (item, mine) => {
    if (item.type === 'file' || item.type === 'location') {
      const Icon = item.type === 'file' ? FileText : MapPin;
      const label =
        item.type === 'file'
          ? 'Sent a file'
          : item.location?.address
          ? `Sent a location · ${item.location.address}`
          : 'Sent a location';
      return (
        <View style={styles.placeholderRow}>
          <Icon size={14} color={mine ? workhorse.successInk : workhorse.secondary} />
          <Text style={[styles.placeholderText, mine && styles.bubbleTextMine]} numberOfLines={2}>
            {label}
          </Text>
        </View>
      );
    }
    return (
      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
        {item.type && item.type !== 'text' ? 'Unsupported message type' : item.text || ''}
      </Text>
    );
  };

  const renderMessage = ({item}) => {
    const mine = isFromSupport(item);
    return (
      <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowThem]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleThem]}>
          {renderMessageContent(item, mine)}
          <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  const statusMeta = thread ? getThreadStatusMeta(thread.status) : null;
  const action = pendingStatus ? STATUS_ACTIONS[pendingStatus] : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={workhorse.surface} />
      <KeyboardAvoidingView
        style={styles.screen}
        // Android runs edge-to-edge here (gradle edgeToEdgeEnabled=true), so
        // adjustResize no longer shrinks the window — pad on both platforms.
        behavior="padding">
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <ArrowLeft size={18} color={workhorse.ink} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title} numberOfLines={1}>
              {thread ? threadTitle(thread) : 'Support chat'}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {connected ? 'Connected' : loading ? 'Connecting…' : 'Offline'}
              {thread?.createdAt ? ` · opened ${formatDateTime(thread.createdAt)}` : ''}
            </Text>
          </View>
          {!!statusMeta && <StatusPill meta={statusMeta} size="sm" style={styles.headerPill} />}
        </View>

        {availableActions.length > 0 && (
          <View style={styles.actionBar}>
            <Text style={styles.actionHint} numberOfLines={1}>
              {thread?.role ? `User is the ${thread.role}` : 'Update status'}
            </Text>
            {updatingStatus ? (
              <ActivityIndicator size="small" color={workhorse.muted} />
            ) : (
              availableActions.map(status => (
                <Pressable
                  key={status}
                  onPress={() => setPendingStatus(status)}
                  style={({pressed}) => [
                    styles.actionButton,
                    status === 'closed' && styles.actionButtonDanger,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={STATUS_ACTIONS[status].label}>
                  <Text
                    style={[
                      styles.actionButtonText,
                      status === 'closed' && styles.actionButtonTextDanger,
                    ]}>
                    {STATUS_ACTIONS[status].label}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        {fatalError ? (
          <View style={styles.centerFill}>
            <Text style={styles.errorText}>{fatalError}</Text>
            <Pressable
              onPress={retryConnect}
              style={({pressed}) => [styles.retryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Retry connecting to chat">
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="small" color={workhorse.muted} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderMessage}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              canLoadMoreRef.current && messages.length >= SUPPORT_HISTORY_PAGE_SIZE ? (
                <Pressable
                  onPress={loadOlderMessages}
                  disabled={loadingOlder || !connected}
                  style={styles.loadOlderButton}
                  accessibilityRole="button"
                  accessibilityLabel="Load earlier messages">
                  {loadingOlder ? (
                    <ActivityIndicator size="small" color={workhorse.muted} />
                  ) : (
                    <Text style={styles.loadOlderText}>Load earlier messages</Text>
                  )}
                </Pressable>
              ) : null
            }
            ListEmptyComponent={<Text style={styles.emptyText}>No messages yet</Text>}
          />
        )}

        {!!notice && (
          <View style={styles.notice}>
            <Text style={styles.noticeText} numberOfLines={2}>
              {notice}
            </Text>
          </View>
        )}

        {!fatalError && (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder={connected ? 'Reply as Trickle Support…' : 'Connecting…'}
              placeholderTextColor={workhorse.muted}
              value={draft}
              onChangeText={setDraft}
              editable={connected}
              multiline
              maxLength={4000}
            />
            <Pressable
              onPress={sendMessage}
              style={[
                styles.sendButton,
                (!connected || !draft.trim()) && styles.sendButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!connected || !draft.trim()}>
              <Send size={15} color={workhorse.surface} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={!!action}
        title={action?.title || ''}
        message={action?.message || ''}
        confirmLabel={action?.label || 'Confirm'}
        destructive={!!action?.destructive}
        onConfirm={confirmStatus}
        onCancel={() => setPendingStatus(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: workhorse.background},
  screen: {flex: 1, backgroundColor: workhorse.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    backgroundColor: workhorse.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: workhorse.border,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: workhorse.surface,
    borderWidth: 1,
    borderColor: workhorse.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {flex: 1, minWidth: 0},
  title: {fontFamily: fonts.body, fontSize: 15, fontWeight: '700', color: workhorse.ink},
  subtitle: {fontFamily: fonts.body, fontSize: 11, color: workhorse.muted, marginTop: 1},
  headerPill: {alignSelf: 'center'},
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: workhorse.surfaceMuted,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: workhorse.border,
  },
  actionHint: {flex: 1, fontFamily: fonts.body, fontSize: 12, color: workhorse.secondary},
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: workhorse.border,
    backgroundColor: workhorse.surface,
  },
  actionButtonDanger: {borderColor: workhorse.dangerSurface},
  actionButtonText: {fontFamily: fonts.body, fontSize: 12.5, fontWeight: '600', color: workhorse.ink},
  actionButtonTextDanger: {color: workhorse.dangerDeep},
  centerFill: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  errorText: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: workhorse.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },
  retryButton: {
    marginTop: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md - 2,
    borderRadius: radius.pill,
    backgroundColor: workhorse.ink,
  },
  retryButtonText: {fontFamily: fonts.body, fontSize: 13, fontWeight: '600', color: workhorse.surface},
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm + 2,
    justifyContent: 'flex-end',
  },
  loadOlderButton: {alignSelf: 'center', paddingVertical: spacing.sm + 2},
  loadOlderText: {fontFamily: fonts.body, fontSize: 12, fontWeight: '600', color: workhorse.muted},
  bubbleRow: {flexDirection: 'row'},
  bubbleRowMine: {justifyContent: 'flex-end'},
  bubbleRowThem: {justifyContent: 'flex-start'},
  bubble: {
    maxWidth: '80%',
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.md + 1,
    borderRadius: radius.lg,
  },
  bubbleMine: {
    backgroundColor: workhorse.successSurface,
    borderBottomRightRadius: spacing.xs,
  },
  bubbleThem: {
    backgroundColor: workhorse.surface,
    borderWidth: 1,
    borderColor: workhorse.border,
    borderBottomLeftRadius: spacing.xs,
  },
  bubbleText: {fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: workhorse.ink},
  bubbleTextMine: {color: workhorse.successInk},
  bubbleTime: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: workhorse.muted,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  bubbleTimeMine: {color: workhorse.success},
  placeholderRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  placeholderText: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    fontStyle: 'italic',
    color: workhorse.secondary,
  },
  emptyText: {
    alignSelf: 'center',
    fontFamily: fonts.body,
    fontSize: 13,
    color: workhorse.muted,
    padding: spacing.xl,
  },
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: workhorse.dangerSurface,
  },
  noticeText: {fontFamily: fonts.body, fontSize: 12.5, color: workhorse.dangerDeep},
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: workhorse.border,
    backgroundColor: workhorse.surface,
  },
  textInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    backgroundColor: workhorse.background,
    borderWidth: 1,
    borderColor: workhorse.border,
    borderRadius: 19,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: workhorse.ink,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: workhorse.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {opacity: 0.35},
  pressed: {opacity: 0.68},
});
