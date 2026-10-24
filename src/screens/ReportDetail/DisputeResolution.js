import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {isUnauthorizedError} from '../../api/client';
import {resolveParcelMatchDispute} from '../../api/reportContext';
import ConfirmModal from '../../components/ConfirmModal';
import DetailSection from '../../components/DetailSection';
import StatusPill from '../../components/StatusPill';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {formatCurrency, formatDateTime, humanize} from '../../utils/format';

// transitorder models.CancellationPolicyAdminDisputeResolution — set on
// match.cancellation.policy only by ResolveDispute, and the server's own
// one-time-only guard. A normal self-service cancellation (policy
// "free"/"late") can carry refund fields too, so refundStatus alone is NOT
// a "resolved" signal.
const ADMIN_DISPUTE_RESOLUTION = 'admin_dispute_resolution';

// ResolveDisputeModel.reason: validate:"required,min=3,max=500".
const REASON_MIN = 3;
const REASON_MAX = 500;

const roundMoney = n => Math.round(n * 100) / 100;

/**
 * Mirrors transitorder's capturedParcelAmount: what the sender was actually
 * charged — pricing.totalPayableAmount, else pricing.senderPayableAmount,
 * else agreedPrice. The server rejects any refundAmount above this.
 */
export const capturedParcelAmount = match => {
  const pricing = match?.pricing || {};
  let amount = Number(match?.agreedPrice) || 0;
  if (pricing.totalPayableAmount > 0) {
    amount = pricing.totalPayableAmount;
  } else if (pricing.senderPayableAmount > 0) {
    amount = pricing.senderPayableAmount;
  }
  return roundMoney(amount);
};

export const isDisputeResolved = match =>
  match?.cancellation?.policy === ADMIN_DISPUTE_RESOLUTION;

// TransactionStatus refund_* values (internal/models/payment.go).
const REFUND_STATUS_META = {
  refund_pending: {bg: workhorse.warningSurface, fg: workhorse.warningInk},
  refund_processing: {bg: workhorse.infoSurface, fg: workhorse.info},
  refund_completed: {bg: workhorse.successSurface, fg: workhorse.successInk},
  refund_failed: {bg: workhorse.dangerSurface, fg: workhorse.dangerDeep},
};

const refundStatusMeta = status => {
  if (!status) {
    // ResolveDispute only sets refundStatus when the payment was escrowed.
    return {
      label: 'No refund issued',
      bg: workhorse.neutralSurface,
      fg: workhorse.neutralInk,
    };
  }
  return {
    label: humanize(status),
    ...(REFUND_STATUS_META[status] || {
      bg: workhorse.neutralSurface,
      fg: workhorse.neutralInk,
    }),
  };
};

/** Keep digits and one decimal point, at most 2 decimals. */
const sanitizeAmount = text => {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (!rest.length) {
    return whole;
  }
  return `${whole}.${rest.join('').slice(0, 2)}`;
};

const Field = ({label, hint, children}) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {children}
    {!!hint && <Text style={styles.hint}>{hint}</Text>}
  </View>
);

/** Read-only summary of an admin dispute resolution (match.cancellation). */
const ResolvedSummary = ({cancellation}) => (
  <DetailSection
    title="Dispute resolution"
    action={<StatusPill meta={refundStatusMeta(cancellation.refundStatus)} />}
    hideEmpty
    fields={[
      {label: 'Refund', value: formatCurrency(cancellation.refundAmount ?? 0)},
      {label: 'Kept by platform', value: formatCurrency(cancellation.feeAmount ?? 0)},
      {label: 'Refund status', value: humanize(cancellation.refundStatus) || 'No refund issued'},
      {label: 'Refund completed', value: formatDateTime(cancellation.refundCompletedAt)},
      {
        label: 'Refund failure',
        value: cancellation.refundFailureReason,
        fullWidth: true,
      },
      {label: 'Reason', value: cancellation.reason, fullWidth: true},
      {
        label: 'Resolved by',
        value: cancellation.cancelledByName || cancellation.cancelledByUserId,
      },
      {label: 'Resolved at', value: formatDateTime(cancellation.createdAt)},
      {
        label: 'Refund transaction ID',
        value: cancellation.refundTransactionId,
        fullWidth: true,
      },
    ]}
  />
);

/**
 * Resolve-dispute action for a reported request → POST
 * /v1/admin/parcel-matches/{id}/resolve-dispute. Mirrors trickle-dash's
 * DisputeResolutionForm: refund amount (capped at the captured amount) +
 * required reason; once resolved, a read-only summary replaces the form.
 *
 * Renders nothing unless the match is disputed or already resolved.
 *
 * @param {object} match - ParcelMatchView (admin)
 * @param {() => Promise<void>} onResolved - parent refetches report + context
 */
const DisputeResolution = ({match, onResolved}) => {
  const cap = capturedParcelAmount(match);
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState(String(cap));
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // The POST returns the updated match — render its resolution right away
  // instead of flashing the form again while the parent refetches.
  const [resolvedMatch, setResolvedMatch] = useState(null);

  useEffect(() => {
    setAmountText(String(cap));
  }, [cap]);

  const current = resolvedMatch || match;
  if (isDisputeResolved(current)) {
    return <ResolvedSummary cancellation={current.cancellation} />;
  }
  if (!match?.disputed) {
    return null;
  }

  const amount = amountText === '' ? NaN : roundMoney(Number(amountText));
  const amountValid = Number.isFinite(amount) && amount >= 0 && amount <= cap;
  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= REASON_MIN;
  const canSubmit = amountValid && reasonValid && !submitting;
  const paymentStatus = match.paymentRef?.status;
  const escrowed = paymentStatus === 'escrowed';

  const onAmountChange = text => {
    const next = sanitizeAmount(text);
    const n = Number(next);
    // Cap client-side so the admin never hits the server's 400.
    setAmountText(next !== '' && Number.isFinite(n) && n > cap ? String(cap) : next);
  };

  const summary = [
    `Refund ${formatCurrency(amountValid ? amount : 0)} of ${formatCurrency(cap)} to the sender.`,
    amountValid && cap - amount > 0
      ? `${formatCurrency(roundMoney(cap - amount))} stays with the platform.`
      : null,
    escrowed
      ? null
      : 'No escrowed payment on this request — the resolution is recorded but no money moves.',
    `Reason: ${trimmedReason}`,
    'This can only be done once.',
  ]
    .filter(Boolean)
    .join('\n');

  const submit = async () => {
    setConfirming(false);
    setSubmitting(true);
    setError(null);
    try {
      const updated = await resolveParcelMatchDispute(match.id, {
        refundAmount: amount,
        reason: trimmedReason,
      });
      if (isDisputeResolved(updated)) {
        setResolvedMatch(updated);
      }
      setOpen(false);
      setReason('');
      await onResolved?.();
    } catch (err) {
      if (!isUnauthorizedError(err)) {
        setError(err?.message || 'Could not resolve the dispute.');
        // 409 = already resolved / no longer disputed elsewhere — refetch so
        // the screen reflects the real state.
        if (err?.status === 409) {
          onResolved?.();
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DetailSection title="Dispute resolution">
      {!open ? (
        <>
          <Text style={styles.note}>
            This request is disputed and hasn't been resolved. Decide how much of the{' '}
            {formatCurrency(cap) || '₹0'} captured amount to refund to the sender.
          </Text>
          <Pressable
            onPress={() => {
              setOpen(true);
              setError(null);
            }}
            style={({pressed}) => [styles.submit, styles.spaced, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Resolve dispute">
            <Text style={styles.submitText}>Resolve dispute</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Field
            label="Refund amount (₹)"
            hint={`Max ${formatCurrency(cap) || '₹0'} — the amount captured from the sender. Anything not refunded stays with the platform.`}>
            <TextInput
              value={amountText}
              onChangeText={onAmountChange}
              placeholder="0"
              placeholderTextColor={workhorse.muted}
              style={styles.input}
              keyboardType="decimal-pad"
              editable={!submitting}
            />
          </Field>

          {!escrowed && (
            <Text style={[styles.hint, styles.warnNote]}>
              Payment status is {humanize(paymentStatus) || 'unknown'} — no escrowed
              payment, so no refund will actually be issued.
            </Text>
          )}

          <Field
            label="Reason"
            hint={`Required, ${REASON_MIN}–${REASON_MAX} characters. Recorded with the resolution.`}>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Traveler no-show confirmed — full refund to sender."
              placeholderTextColor={workhorse.muted}
              style={[styles.input, styles.multiline]}
              multiline
              maxLength={REASON_MAX}
              editable={!submitting}
            />
          </Field>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.row}>
            <Pressable
              onPress={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={submitting}
              style={({pressed}) => [
                styles.secondary,
                submitting && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirming(true)}
              disabled={!canSubmit}
              style={({pressed}) => [
                styles.submit,
                styles.flex,
                !canSubmit && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Submit dispute resolution">
              {submitting ? (
                <ActivityIndicator color={workhorse.surface} />
              ) : (
                <Text style={styles.submitText}>Resolve dispute</Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      <ConfirmModal
        visible={confirming}
        title="Resolve dispute?"
        message={summary}
        confirmLabel={amountValid && amount > 0 ? 'Refund & resolve' : 'Resolve'}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
        destructive
      />
    </DetailSection>
  );
};

const styles = StyleSheet.create({
  field: {marginBottom: spacing.lg},
  label: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
    color: workhorse.inkSoft,
    marginBottom: spacing.sm,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
    color: workhorse.muted,
    marginTop: spacing.xs,
  },
  warnNote: {
    color: workhorse.warningInk,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.inkSoft,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: workhorse.ink,
    borderWidth: 1,
    borderColor: workhorse.border,
    borderRadius: radius.sm,
    backgroundColor: workhorse.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  multiline: {minHeight: 72, textAlignVertical: 'top'},
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: workhorse.dangerDeep,
    marginBottom: spacing.md,
  },
  row: {flexDirection: 'row', gap: spacing.sm},
  flex: {flex: 1},
  spaced: {marginTop: spacing.md},
  submit: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: workhorse.danger,
  },
  submitText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: workhorse.surface,
  },
  secondary: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: workhorse.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {fontFamily: fonts.body, fontSize: 15, color: workhorse.ink},
  disabled: {opacity: 0.45},
  pressed: {opacity: 0.7},
});

export default DisputeResolution;
