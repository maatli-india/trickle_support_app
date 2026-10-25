import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import DetailSection from '../../components/DetailSection';
import StatusPill from '../../components/StatusPill';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatLocation,
  formatYesNo,
  humanize,
  parseDate,
} from '../../utils/format';
import {isDisputeResolved} from './DisputeResolution';

// Parcel-match statuses that mean "something went wrong" get a danger tint;
// finished-well ones get success; everything else is neutral.
const DANGER_MATCH = [
  'interrupted_in_transit',
  'return_pending',
  'returned',
  'not_picked_up',
  'rejected',
  'declined',
  'cancelled',
  'cancelled_by_sender',
  'cancelled_by_traveler',
  'expired',
];
const SUCCESS_MATCH = ['delivered', 'completed'];

const matchStatusMeta = status => {
  if (DANGER_MATCH.includes(status)) {
    return {label: humanize(status), bg: workhorse.dangerSurface, fg: workhorse.dangerDeep};
  }
  if (SUCCESS_MATCH.includes(status)) {
    return {label: humanize(status), bg: workhorse.successSurface, fg: workhorse.successInk};
  }
  return {label: humanize(status) || 'Unknown', bg: workhorse.neutralSurface, fg: workhorse.neutralInk};
};

const Callout = ({tone = 'danger', title, children}) => (
  <View style={[styles.callout, tone === 'danger' ? styles.danger : styles.warning]}>
    <Text style={styles.calloutTitle}>{title}</Text>
    {children}
  </View>
);

const CalloutLine = ({children}) => (
  <Text style={styles.calloutText} selectable>
    {children}
  </Text>
);

const ErrorNote = ({error, what}) => (
  <Text style={styles.errorText}>
    {error?.status === 404
      ? `${what} not found — it may have been deleted.`
      : `Couldn't load the ${what.toLowerCase()}${error?.message ? `: ${error.message}` : '.'}`}
  </Text>
);

/** The reported delivery request (parcel match, admin view). */
export const RequestCard = ({match, matchId, error}) => {
  if (!match) {
    return (
      <DetailSection title="Request" fields={[{label: 'Request ID', value: matchId, fullWidth: true}]}>
        <ErrorNote error={error} what="Request" />
      </DetailSection>
    );
  }

  const pricing = match.pricing || {};
  const weight = [
    match.weightRange,
    match.estimatedWeightKg ? `~${match.estimatedWeightKg} kg` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const category = [humanize(match.parcelCategory), humanize(match.parcelSubcategory)]
    .filter(Boolean)
    .join(' › ');
  // An admin dispute resolution also lives on match.cancellation but doesn't
  // cancel anything — DisputeResolution renders it in its own section.
  const cancellation = isDisputeResolved(match) ? null : match.cancellation;

  return (
    <DetailSection
      title="Request"
      action={<StatusPill meta={matchStatusMeta(match.status)} />}
      hideEmpty
      fields={[
        {label: 'Parcel', value: match.parcelDescription, fullWidth: true},
        {label: 'Category', value: category},
        {label: 'Weight', value: weight},
        {label: 'Packages', value: match.packageCount},
        {label: 'Declared value', value: formatCurrency(match.declaredValue || null)},
        {label: 'Pickup', value: formatLocation(match.from), fullWidth: true},
        {label: 'Drop', value: formatLocation(match.to), fullWidth: true},
        {label: 'Pickup point', value: match.pickupMeetingPoint, fullWidth: true},
        {label: 'Delivery point', value: match.deliveryMeetingPoint, fullWidth: true},
        {label: 'Departure', value: match.departureDate},
        {label: 'Arrival', value: match.arrivalDate},
        {label: 'Agreed price', value: formatCurrency(match.agreedPrice || null)},
        {label: 'Sender pays', value: formatCurrency(pricing.totalPayableAmount || pricing.senderPayableAmount || null)},
        {label: 'Traveler payout', value: formatCurrency(pricing.travelerPayoutAmount || null)},
        {label: 'GST', value: formatCurrency(pricing.gstAmount || null)},
        {label: 'Note', value: match.note, fullWidth: true},
        {label: 'Created', value: formatDateTime(match.createdAt)},
        {label: 'Updated', value: formatDateTime(match.updatedAt)},
      ]}>
      {match.disputed && (
        <Callout title="Disputed">
          <CalloutLine>{match.disputeReason || 'No reason recorded.'}</CalloutLine>
        </Callout>
      )}
      {match.safetyHold && (
        <Callout title="Safety hold">
          {!!parseDate(match.safetyHoldSetAt) && (
            <CalloutLine>Placed {formatDateTime(match.safetyHoldSetAt)}</CalloutLine>
          )}
          {!!match.safetyHoldReportId && (
            <CalloutLine>From report {match.safetyHoldReportId}</CalloutLine>
          )}
        </Callout>
      )}
      {!!match.exceptionReason && (
        <Callout tone="warning" title="Exception">
          <CalloutLine>{humanize(match.exceptionReason)}</CalloutLine>
        </Callout>
      )}
      {!!cancellation && (
        <Callout tone="warning" title="Cancelled">
          <CalloutLine>
            By {cancellation.cancelledByName || humanize(cancellation.cancelledBy) || 'unknown'}
            {parseDate(cancellation.createdAt) ? ` · ${formatDateTime(cancellation.createdAt)}` : ''}
          </CalloutLine>
          {!!(cancellation.reason || cancellation.reasonCode) && (
            <CalloutLine>
              Reason: {cancellation.reason || humanize(cancellation.reasonCode)}
            </CalloutLine>
          )}
          <CalloutLine>
            Policy {humanize(cancellation.policy) || '—'} · fee{' '}
            {formatCurrency(cancellation.feeAmount) || '—'} · refund{' '}
            {formatCurrency(cancellation.refundAmount) || '—'}
            {cancellation.refundStatus ? ` (${humanize(cancellation.refundStatus)})` : ''}
          </CalloutLine>
        </Callout>
      )}
    </DetailSection>
  );
};

/** The traveler's trip (travel plan) the request is attached to. */
export const TripCard = ({travelPlan, travelPlanId, error}) => {
  if (!travelPlan) {
    if (!travelPlanId) {
      return null;
    }
    return (
      <DetailSection title="Trip" fields={[{label: 'Trip ID', value: travelPlanId, fullWidth: true}]}>
        <ErrorNote error={error} what="Trip" />
      </DetailSection>
    );
  }

  const capacity = [
    travelPlan.maxWeightKg ? `${travelPlan.maxWeightKg} kg` : '',
    travelPlan.maxParcelCount ? `${travelPlan.maxParcelCount} parcels` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <DetailSection
      title="Trip"
      action={<StatusPill meta={matchStatusMeta(travelPlan.status)} />}
      hideEmpty
      fields={[
        {label: 'From', value: formatLocation(travelPlan.from), fullWidth: true},
        {label: 'To', value: formatLocation(travelPlan.to), fullWidth: true},
        {label: 'Departure', value: travelPlan.departureDate},
        {label: 'Arrival', value: travelPlan.arrivalDate},
        {label: 'Mode', value: humanize(travelPlan.travelMode)},
        {label: 'Price / package', value: formatCurrency(travelPlan.pricePerPackage)},
        {label: 'Capacity', value: capacity},
        {label: 'Accepting requests', value: formatYesNo(travelPlan.acceptingNewRequests)},
        {label: 'Notes', value: travelPlan.additionalInfo, fullWidth: true},
        {label: 'Created', value: formatDate(travelPlan.createdAt)},
      ]}
    />
  );
};

const styles = StyleSheet.create({
  callout: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 3,
  },
  danger: {backgroundColor: workhorse.dangerSurface},
  warning: {backgroundColor: workhorse.warningSurface},
  calloutTitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    color: workhorse.ink,
  },
  calloutText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.inkSoft,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.dangerDeep,
  },
});
