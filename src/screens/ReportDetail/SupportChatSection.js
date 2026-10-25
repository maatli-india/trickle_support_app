import React, {useCallback, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {ChevronRight, MessageSquarePlus, RotateCw} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {adminCreateSupportThread, listSupportThreads} from '../../api/supportChat';
import DetailSection from '../../components/DetailSection';
import StatusPill from '../../components/StatusPill';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {formatRelative, humanize} from '../../utils/format';
import {getThreadStatusMeta, threadTitle} from '../SupportChat/status';

/**
 * "Support chat" with the reporter: a preview of their most recent support
 * thread (tap to open it), or a button to start one on their behalf.
 * Loads independently of the rest of Report Detail, and re-checks on every
 * focus so coming back from the thread shows the latest message.
 */
const SupportChatSection = ({report, navigation}) => {
  const reporterId = report?.reporterId;
  // For a request-type report, scope to this specific request's thread (not
  // just "any thread this reporter happens to have open" — a sender and
  // traveler on the same request could each have their own unrelated
  // threads, and a reporter can have threads for other requests too).
  const matchId = report?.reportedType === 'request' ? report?.reportedId : undefined;
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Each lookup gets a token; responses for a superseded one are dropped
  // (also covers unmount — nothing newer than the last token arrives).
  const requestId = useRef(0);

  const lookup = useCallback(async () => {
    if (!reporterId) {
      return;
    }
    const id = ++requestId.current;
    try {
      const res = await listSupportThreads({userId: reporterId, matchId, limit: 1});
      if (id !== requestId.current) {
        return;
      }
      setThread(res?.items?.[0] || null);
      setLoadError(null);
    } catch (err) {
      if (id === requestId.current && !isUnauthorizedError(err)) {
        setLoadError(err?.message || 'Could not load support chats.');
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [reporterId, matchId]);

  useFocusEffect(
    useCallback(() => {
      lookup();
      return () => {
        requestId.current++;
      };
    }, [lookup]),
  );

  const openThread = threadId =>
    navigation.navigate('SupportChatThread', {threadId});

  const startChat = async () => {
    if (creating) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await adminCreateSupportThread({
        userId: reporterId,
        // 'request_support' (not report.category) when this is a
        // request-type report — matches the exact constant reason the
        // consumer app's "Chat with us" now always uses for a request (see
        // ReportIssueFromRequest), so whichever side starts the thread
        // first, the other side's get-or-create finds the same one instead
        // of creating a second, duplicate thread for the same request.
        reason: matchId ? 'request_support' : report.category,
        reasonLabel: matchId ? 'Issue with this request' : humanize(report.category),
        matchId,
        role: undefined,
      });
      if (!created?.id) {
        throw new Error('The server did not return a chat.');
      }
      setThread(created);
      openThread(created.id);
    } catch (err) {
      if (!isUnauthorizedError(err)) {
        setCreateError(err?.message || 'Could not start a chat.');
      }
    } finally {
      setCreating(false);
    }
  };

  if (!reporterId) {
    return null;
  }

  const renderBody = () => {
    if (loading) {
      return <Text style={styles.note}>Checking for an existing chat…</Text>;
    }
    if (loadError) {
      return (
        <View>
          <Text style={styles.error}>{loadError}</Text>
          <Pressable
            onPress={() => {
              setLoading(true);
              setLoadError(null);
              lookup();
            }}
            style={({pressed}) => [styles.retry, pressed && styles.pressed]}
            accessibilityRole="button">
            <RotateCw size={14} color={workhorse.ink} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    if (thread) {
      const meta = getThreadStatusMeta(thread.status);
      return (
        <Pressable
          onPress={() => openThread(thread.id)}
          style={({pressed}) => [styles.preview, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Open support chat, ${meta.label}`}>
          <View style={styles.previewMain}>
            <View style={styles.previewTop}>
              <StatusPill meta={meta} />
              <Text style={styles.time} numberOfLines={1}>
                {formatRelative(thread.lastMessageAt || thread.createdAt)}
              </Text>
            </View>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {threadTitle(thread)}
            </Text>
            <Text style={styles.previewText} numberOfLines={2}>
              {thread.lastMessagePreview || 'No messages yet'}
            </Text>
          </View>
          <ChevronRight size={18} color={workhorse.muted} />
        </Pressable>
      );
    }
    return (
      <View>
        <Text style={styles.note}>No support chat with the reporter yet.</Text>
        {!!createError && <Text style={styles.error}>{createError}</Text>}
        <Pressable
          onPress={startChat}
          disabled={creating}
          style={({pressed}) => [
            styles.start,
            creating && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start a support chat with the reporter">
          {creating ? (
            <ActivityIndicator color={workhorse.surface} />
          ) : (
            <>
              <MessageSquarePlus size={16} color={workhorse.surface} />
              <Text style={styles.startText}>
                {createError ? 'Try again' : 'Start a chat'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    );
  };

  return <DetailSection title="Support chat">{renderBody()}</DetailSection>;
};

const styles = StyleSheet.create({
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: workhorse.muted,
    marginBottom: spacing.md,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: workhorse.dangerDeep,
    marginBottom: spacing.md,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: workhorse.border,
    backgroundColor: workhorse.surfaceMuted,
  },
  previewMain: {flex: 1},
  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  previewTitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    color: workhorse.ink,
    marginTop: spacing.sm,
  },
  previewText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.inkSoft,
    marginTop: 2,
  },
  time: {fontFamily: fonts.body, fontSize: 11, color: workhorse.muted},
  start: {
    minHeight: 48,
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: workhorse.ink,
  },
  startText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: workhorse.surface,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: workhorse.border,
  },
  retryText: {fontFamily: fonts.body, fontSize: 13.5, color: workhorse.ink},
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.68},
});

export default SupportChatSection;
