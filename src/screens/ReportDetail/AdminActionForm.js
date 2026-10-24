import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Check} from 'lucide-react-native';
import {isUnauthorizedError} from '../../api/client';
import {REPORT_RESOLUTIONS, updateReportByAdmin} from '../../api/reports';
import ChipSelect from '../../components/ChipSelect';
import ConfirmModal from '../../components/ConfirmModal';
import DetailSection from '../../components/DetailSection';
import {REPORT_STATUS_META, REPORT_STATUSES} from '../../components/StatusPill';
import {workhorse} from '../../constants/colors';
import fonts from '../../constants/fonts';
import radius from '../../constants/radius';
import spacing from '../../constants/spacing';
import {humanize} from '../../utils/format';

const STATUS_OPTIONS = REPORT_STATUSES.map(status => ({
  value: status,
  label: REPORT_STATUS_META[status].label,
}));

const RESOLUTION_OPTIONS = [
  {value: '', label: 'None'},
  ...REPORT_RESOLUTIONS.map(value => ({value, label: humanize(value)})),
];

const Field = ({label, hint, children}) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {children}
    {!!hint && <Text style={styles.hint}>{hint}</Text>}
  </View>
);

/**
 * Review form → PATCH /v1/reports/admin/{id}. Mirrors trickle-dash's
 * ReportActionForm (status, resolution, reporter message, internal note,
 * suspend-reported-user), plus assigned agent ID.
 *
 * @param {object} report
 * @param {() => Promise<void>} onSaved - parent refetches the report
 */
const AdminActionForm = ({report, onSaved}) => {
  const [status, setStatus] = useState(report.status);
  const [resolution, setResolution] = useState(report.resolution || '');
  const [reporterMessage, setReporterMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState('');
  const [suspend, setSuspend] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Re-sync pickers when the report itself changes (after a save/refetch).
  useEffect(() => {
    setStatus(report.status);
    setResolution(report.resolution || '');
  }, [report.status, report.resolution]);

  const isUserReport = report.reportedType === 'user';
  // ReportAdminUpdateModel documents suspendReportedUser as honored only for
  // reportedType=user AND resolution=action_taken.
  const canSuspend = isUserReport && resolution === 'action_taken';
  useEffect(() => {
    if (!canSuspend) {
      setSuspend(false);
    }
  }, [canSuspend]);

  const hasChanges =
    status !== report.status ||
    resolution !== (report.resolution || '') ||
    !!reporterMessage.trim() ||
    !!internalNote.trim() ||
    !!assignedAgentId.trim() ||
    suspend;

  const summary = [
    status !== report.status
      ? `Status: ${REPORT_STATUS_META[report.status]?.label || humanize(report.status)} → ${REPORT_STATUS_META[status].label}`
      : `Status stays ${REPORT_STATUS_META[status].label}`,
    resolution && resolution !== (report.resolution || '')
      ? `Resolution: ${humanize(resolution)}`
      : null,
    reporterMessage.trim() ? 'Message will be visible to the reporter.' : null,
    internalNote.trim() ? 'Internal note will be added.' : null,
    assignedAgentId.trim() ? `Assign to ${assignedAgentId.trim()}.` : null,
    suspend
      ? 'SUSPEND the reported account — blocks it and revokes its sessions immediately.'
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const submit = async () => {
    setConfirming(false);
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await updateReportByAdmin(report.id, {
        status,
        resolution,
        reporterMessage,
        internalNote,
        assignedAgentId,
        suspendReportedUser: suspend,
      });
      setReporterMessage('');
      setInternalNote('');
      setAssignedAgentId('');
      setSuspend(false);
      setSaved(true);
      await onSaved?.();
    } catch (err) {
      if (!isUnauthorizedError(err)) {
        setError(err?.message || 'Could not update the report.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DetailSection title="Admin actions">
      <Field label="Status">
        <ChipSelect
          options={STATUS_OPTIONS}
          value={status}
          onChange={value => {
            setStatus(value);
            setSaved(false);
          }}
          disabled={submitting}
        />
      </Field>

      <Field label="Resolution" hint="Set when resolving or closing.">
        <ChipSelect
          options={RESOLUTION_OPTIONS}
          value={resolution}
          onChange={value => {
            setResolution(value);
            setSaved(false);
          }}
          disabled={submitting}
        />
      </Field>

      <Field
        label="Message to reporter"
        hint="Optional. Shown to the reporter and recorded in the status history.">
        <TextInput
          value={reporterMessage}
          onChangeText={setReporterMessage}
          placeholder="e.g. We've reviewed this and taken action."
          placeholderTextColor={workhorse.muted}
          style={[styles.input, styles.multiline]}
          multiline
          maxLength={2000}
          editable={!submitting}
        />
      </Field>

      <Field
        label="Internal note"
        hint="Optional. Never shown to the reporter. Notes are write-only — the API doesn't return them.">
        <TextInput
          value={internalNote}
          onChangeText={setInternalNote}
          placeholder="Context for other agents"
          placeholderTextColor={workhorse.muted}
          style={[styles.input, styles.multiline]}
          multiline
          maxLength={5000}
          editable={!submitting}
        />
      </Field>

      <Field
        label="Assigned agent ID"
        hint="Optional. Write-only — the current assignee isn't returned by the API.">
        <TextInput
          value={assignedAgentId}
          onChangeText={setAssignedAgentId}
          placeholder="Agent ID"
          placeholderTextColor={workhorse.muted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={120}
          editable={!submitting}
        />
      </Field>

      {isUserReport && (
        <Pressable
          onPress={() => canSuspend && !submitting && setSuspend(v => !v)}
          disabled={!canSuspend || submitting}
          style={[styles.checkRow, !canSuspend && styles.disabled]}
          accessibilityRole="checkbox"
          accessibilityState={{checked: suspend, disabled: !canSuspend}}>
          <View style={[styles.checkbox, suspend && styles.checkboxOn]}>
            {suspend && <Check size={14} color={workhorse.surface} />}
          </View>
          <View style={styles.checkTextWrap}>
            <Text style={styles.checkText}>Suspend the reported account</Text>
            <Text style={styles.hint}>
              {canSuspend
                ? 'Blocks the account and revokes its active sessions immediately.'
                : 'Available when resolution is "Action taken".'}
            </Text>
          </View>
        </Pressable>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
      {saved && !error && <Text style={styles.success}>Saved — report updated.</Text>}

      <Pressable
        onPress={() => setConfirming(true)}
        disabled={!hasChanges || submitting}
        style={({pressed}) => [
          styles.submit,
          suspend && styles.submitDanger,
          (!hasChanges || submitting) && styles.disabled,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Save report changes">
        {submitting ? (
          <ActivityIndicator color={workhorse.surface} />
        ) : (
          <Text style={styles.submitText}>Save changes</Text>
        )}
      </Pressable>

      <ConfirmModal
        visible={confirming}
        title={suspend ? 'Suspend and update?' : 'Update report?'}
        message={summary}
        confirmLabel={suspend ? 'Suspend & save' : 'Save'}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
        destructive={suspend}
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
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: workhorse.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: workhorse.surface,
    marginTop: 1,
  },
  checkboxOn: {backgroundColor: workhorse.danger, borderColor: workhorse.danger},
  checkTextWrap: {flex: 1},
  checkText: {fontFamily: fonts.body, fontSize: 14, color: workhorse.ink},
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: workhorse.dangerDeep,
    marginBottom: spacing.md,
  },
  success: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: workhorse.successInk,
    marginBottom: spacing.md,
  },
  submit: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: workhorse.ink,
  },
  submitDanger: {backgroundColor: workhorse.danger},
  submitText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: workhorse.surface,
  },
  disabled: {opacity: 0.45},
  pressed: {opacity: 0.7},
});

export default AdminActionForm;
