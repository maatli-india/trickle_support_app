import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AlertTriangle, RotateCw} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {getReport} from '../../api/reports';
import {resolveReportContext} from '../../api/reportContext';
import ScreenHeader from '../../components/ScreenHeader';
import DetailSection from '../../components/DetailSection';
import StatusPill, {getReportStatusMeta} from '../../components/StatusPill';
import PersonCard from '../../components/PersonCard';
import Loader from '../../components/Loader';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {
  formatDateTime,
  formatRelative,
  humanize,
  parseDate,
} from '../../utils/format';
import PhotoStrip from './PhotoStrip';
import {RequestCard, TripCard} from './RequestCards';
import AdminActionForm from './AdminActionForm';
import DisputeResolution from './DisputeResolution';

const OPEN_STATUSES = ['submitted', 'under_review'];

const StatusTimeline = ({history}) => (
  <View>
    {history.map((event, index) => {
      const meta = getReportStatusMeta(event.status);
      const last = index === history.length - 1;
      return (
        <View key={`${event.status}-${event.createdAt}-${index}`} style={styles.tlRow}>
          <View style={styles.tlRail}>
            <View style={[styles.tlDot, {backgroundColor: meta.fg}]} />
            {!last && <View style={styles.tlLine} />}
          </View>
          <View style={[styles.tlBody, !last && styles.tlBodySpaced]}>
            <Text style={styles.tlStatus}>{meta.label}</Text>
            <Text style={styles.tlTime}>
              {formatDateTime(event.createdAt)}
              {event.actorId ? `  ·  by ${event.actorId}` : ''}
            </Text>
            {!!event.message && (
              <Text style={styles.tlMessage} selectable>
                {event.message}
              </Text>
            )}
          </View>
        </View>
      );
    })}
  </View>
);

const SlaValue = ({report}) => {
  const due = parseDate(report.slaDueAt);
  if (!due) {
    return null;
  }
  const overdue = OPEN_STATUSES.includes(report.status) && due.getTime() < Date.now();
  return (
    <Text style={[styles.value, overdue && styles.overdue]} selectable>
      {formatDateTime(report.slaDueAt)}
      {OPEN_STATUSES.includes(report.status)
        ? `\n${overdue ? 'Overdue · ' : 'Due '}${formatRelative(report.slaDueAt)}`
        : ''}
    </Text>
  );
};

export default function ReportDetailScreen({navigation, route}) {
  const reportId = route?.params?.reportId;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadContext = useCallback(async loadedReport => {
    setContextLoading(true);
    try {
      const resolved = await resolveReportContext(loadedReport);
      if (mounted.current) {
        setContext(resolved);
      }
    } finally {
      if (mounted.current) {
        setContextLoading(false);
      }
    }
  }, []);

  const load = useCallback(
    async ({mode = 'initial'} = {}) => {
      if (!reportId) {
        setError('No report specified.');
        setLoading(false);
        return;
      }
      if (mode === 'initial') {
        setLoading(true);
      } else if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const fetched = await getReport(reportId);
        if (!mounted.current) {
          return;
        }
        setReport(fetched);
        setError(null);
        // Sender/traveler/request/trip — shown progressively below the
        // report so a slow user lookup doesn't hold up the main content.
        loadContext(fetched);
      } catch (err) {
        if (mounted.current && !isUnauthorizedError(err)) {
          setError(
            err?.status === 404
              ? 'This report no longer exists.'
              : err?.message || 'Could not load this report.',
          );
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [reportId, loadContext],
  );

  useEffect(() => {
    load();
  }, [load]);

  const renderContext = () => {
    if (!report) {
      return null;
    }
    if (report.reportedType === 'system') {
      return (
        <DetailSection title="Full details">
          <Text style={styles.note}>
            System-wide report — not tied to a specific user or request.
          </Text>
        </DetailSection>
      );
    }
    if (!report.reportedId) {
      return (
        <DetailSection title="Full details">
          <Text style={styles.note}>No reported user or request ID on this report.</Text>
        </DetailSection>
      );
    }
    if (contextLoading && !context) {
      return (
        <DetailSection title="Full details">
          <Loader size={56} label="Loading request and people involved" />
        </DetailSection>
      );
    }
    if (!context) {
      return null;
    }
    const {errors = {}} = context;

    if (report.reportedType === 'user') {
      return (
        <PersonCard
          title="Reported user"
          user={context.reportedUser}
          userId={report.reportedId}
          error={errors.reportedUser}
        />
      );
    }

    if (report.reportedType === 'request') {
      const match = context.match;
      return (
        <>
          <RequestCard match={match} matchId={report.reportedId} error={errors.match} />
          {!!match && (
            <>
              <PersonCard
                title="Sender"
                user={context.sender}
                userId={match.senderUserId}
                fallbackName={match.senderName}
                error={errors.sender}
              />
              <PersonCard
                title="Traveler"
                user={context.traveler}
                userId={match.travelerUserId}
                fallbackName={match.travelerName}
                error={errors.traveler}
              />
              <TripCard
                travelPlan={context.travelPlan}
                travelPlanId={match.travelPlanId}
                error={errors.travelPlan}
              />
            </>
          )}
        </>
      );
    }

    return (
      <DetailSection title="Full details">
        <Text style={styles.note}>
          Unrecognized reported type "{report.reportedType}" · {report.reportedId}
        </Text>
      </DetailSection>
    );
  };

  // "Reported by" — resolved alongside the rest of the context (see
  // resolveReportContext); reporterId is only present on admin responses.
  const renderReporter = () => {
    if (!report?.reporterId) {
      return null;
    }
    if (!context) {
      return contextLoading ? (
        <DetailSection title="Reported by">
          <Text style={styles.note}>Loading reporter…</Text>
        </DetailSection>
      ) : null;
    }
    return (
      <PersonCard
        title="Reported by"
        user={context.reporter}
        userId={report.reporterId}
        error={context.errors?.reporter}
      />
    );
  };

  // Moved below the context cards: it's an action, so it sits with the other
  // admin tooling at the bottom. Renders nothing unless the match is
  // disputed or already resolved.
  const renderDispute = () => {
    if (report?.reportedType !== 'request' || !context?.match) {
      return null;
    }
    return (
      <DisputeResolution
        match={context.match}
        onResolved={() => load({mode: 'silent'})}
      />
    );
  };

  const renderBody = () => {
    if (loading) {
      return <Loader fullscreen label="Loading report" />;
    }
    if (error && !report) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Couldn't load report</Text>
          <Text style={styles.errorText}>{error}</Text>
          {!!reportId && (
            <Pressable
              onPress={() => load()}
              style={({pressed}) => [styles.retryButton, pressed && styles.pressed]}
              accessibilityRole="button">
              <RotateCw size={14} color={workhorse.surface} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
      );
    }

    const history = report.statusHistory || [];
    const photos = report.photos || [];

    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({mode: 'refresh'})}
              tintColor={workhorse.muted}
              colors={[workhorse.ink]}
            />
          }>
          {/* Header — reads as page framing, separated from the cards below. */}
          <View style={styles.header}>
            <View>
              <Text style={styles.heroTitle}>{humanize(report.category) || 'Report'}</Text>
              <Text style={styles.heroSub} selectable>
                Against {report.reportedType}
                {report.reportedId ? ` · ${report.reportedId}` : ''}
              </Text>
              <View style={styles.heroPills}>
                <StatusPill status={report.status} size="md" />
                {!!parseDate(report.createdAt) && (
                  <Text style={styles.heroMeta}>
                    Filed {formatRelative(report.createdAt)}
                  </Text>
                )}
              </View>
            </View>

            {report.urgent && (
              <View style={styles.urgentBanner}>
                <AlertTriangle size={16} color={workhorse.dangerDeep} />
                <Text style={styles.urgentText}>
                  Urgent report.
                  {report.category === 'suspected_illegal_contents' &&
                  report.reportedType === 'request'
                    ? ' The shipment was automatically placed on a safety hold.'
                    : ''}
                </Text>
              </View>
            )}
          </View>

          {/* 1. The report itself + who filed it. */}
          <DetailSection
            title="Report"
            fields={[
              {label: 'Description', value: report.description, fullWidth: true},
              {label: 'Category', value: humanize(report.category)},
              {
                label: 'Urgent',
                value: (
                  <Text style={[styles.value, report.urgent && styles.overdue]}>
                    {report.urgent ? 'Yes' : 'No'}
                  </Text>
                ),
              },
              {label: 'Status', value: <StatusPill status={report.status} />},
              {label: 'Resolution', value: humanize(report.resolution)},
              {label: 'SLA due', value: <SlaValue report={report} />},
              {label: 'Created', value: formatDateTime(report.createdAt)},
              {label: 'Resolved', value: formatDateTime(report.resolvedAt)},
              {label: 'Updated', value: formatDateTime(report.updatedAt)},
              {label: 'Message to reporter', value: report.reporterMessage, fullWidth: true},
              {label: 'Report ID', value: report.id, fullWidth: true},
            ]}
          />

          {renderReporter()}

          {/* 2. Request details, then the people involved (and the trip). */}
          {renderContext()}

          {/* 3. Screenshots. */}
          {photos.length > 0 && (
            <DetailSection title={`Screenshots (${photos.length})`}>
              <PhotoStrip fileIds={photos} />
            </DetailSection>
          )}

          {/* 4. History and admin tooling. */}
          <DetailSection title="Status history">
            {history.length ? (
              <StatusTimeline history={history} />
            ) : (
              <Text style={styles.note}>No history recorded.</Text>
            )}
          </DetailSection>

          {renderDispute()}

          <AdminActionForm
            report={report}
            onSaved={() => load({mode: 'silent'})}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={workhorse.surface} />
      <ScreenHeader lightTheme showBack navigation={navigation} subtitle="Report" />
      {renderBody()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: workhorse.background},
  flex: {flex: 1},
  content: {padding: spacing.lg, paddingBottom: spacing.xxl * 2},
  header: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: workhorse.divider,
  },
  heroTitle: {fontFamily: fonts.display, fontSize: 26, color: workhorse.ink},
  heroSub: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: workhorse.muted,
    marginTop: spacing.xs,
  },
  heroPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  heroMeta: {fontFamily: fonts.body, fontSize: 12.5, color: workhorse.muted},
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: workhorse.dangerSurface,
    marginTop: spacing.lg,
  },
  urgentText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.dangerDeep,
  },
  value: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: workhorse.ink,
  },
  overdue: {color: workhorse.dangerDeep, fontWeight: '600'},
  note: {fontFamily: fonts.body, fontSize: 13, color: workhorse.muted},
  tlRow: {flexDirection: 'row'},
  tlRail: {width: 18, alignItems: 'center'},
  tlDot: {width: 10, height: 10, borderRadius: 5, marginTop: 4},
  tlLine: {flex: 1, width: 2, backgroundColor: workhorse.divider, marginTop: 2},
  tlBody: {flex: 1, paddingLeft: spacing.sm},
  tlBodySpaced: {paddingBottom: spacing.lg},
  tlStatus: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    color: workhorse.ink,
  },
  tlTime: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: workhorse.muted,
    marginTop: 2,
  },
  tlMessage: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.inkSoft,
    marginTop: spacing.xs,
  },
  errorBox: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl},
  errorTitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '600',
    color: workhorse.ink,
  },
  errorText: {
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
