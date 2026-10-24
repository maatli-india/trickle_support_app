import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {AlertCircle, CheckCircle2, Eye, XCircle} from 'lucide-react-native';
import {workhorse} from '../constants/colors';
import fonts from '../constants/fonts';
import radius from '../constants/radius';
import spacing from '../constants/spacing';

/**
 * Report status → presentation lookup. Same {label, bg, fg, Icon} shape as
 * the consumer app's STATUS_META (src/screens/Requests/index.js), keyed by the
 * backend's ReportStatus values (transitorder internal/models/report.go).
 * Exported so detail screens can reuse labels/colors/icons directly.
 */
export const REPORT_STATUS_META = {
  submitted: {
    label: 'Submitted',
    bg: workhorse.warningSurface,
    fg: workhorse.warningInk,
    Icon: AlertCircle,
  },
  under_review: {
    label: 'Under review',
    bg: workhorse.infoSurface,
    fg: workhorse.info,
    Icon: Eye,
  },
  resolved: {
    label: 'Resolved',
    bg: workhorse.successSurface,
    fg: workhorse.successInk,
    Icon: CheckCircle2,
  },
  closed_no_action: {
    label: 'Closed · no action',
    bg: workhorse.neutralSurface,
    fg: workhorse.neutralInk,
    Icon: XCircle,
  },
};

/** Ordered list of report statuses, e.g. for filter chips. */
export const REPORT_STATUSES = Object.keys(REPORT_STATUS_META);

const humanize = value =>
  String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());

/**
 * Always returns a meta object — unknown statuses get a neutral fallback
 * (humanized label, no icon) instead of crashing.
 */
export const getReportStatusMeta = status =>
  REPORT_STATUS_META[status] || {
    label: humanize(status),
    bg: workhorse.neutralSurface,
    fg: workhorse.neutralInk,
    Icon: null,
  };

/**
 * Colored status badge: icon + label.
 *
 * @param {string} status - submitted | under_review | resolved | closed_no_action
 * @param {string} [label] - override the default label
 * @param {object} [meta] - override the lookup map (any {label,bg,fg,Icon})
 * @param {'sm'|'md'} [size]
 */
const StatusPill = ({status, label, meta, size = 'sm', style}) => {
  const resolved = meta || getReportStatusMeta(status);
  const {Icon} = resolved;
  const isMd = size === 'md';
  return (
    <View
      style={[
        styles.pill,
        isMd && styles.pillMd,
        {backgroundColor: resolved.bg},
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label || resolved.label}`}>
      {!!Icon && <Icon size={isMd ? 13 : 11} color={resolved.fg} />}
      <Text
        style={[styles.text, isMd && styles.textMd, {color: resolved.fg}]}
        numberOfLines={1}>
        {label || resolved.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  pillMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {fontFamily: fonts.body, fontSize: 10.5, fontWeight: '600'},
  textMd: {fontSize: 12.5},
});

export default StatusPill;
