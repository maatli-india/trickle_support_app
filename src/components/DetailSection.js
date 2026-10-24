import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {workhorse} from '../constants/colors';
import fonts from '../constants/fonts';
import radius from '../constants/radius';
import spacing from '../constants/spacing';

const isEmpty = value =>
  value === null || value === undefined || value === '';

/**
 * A titled card with a label/value grid — the building block for report,
 * user and request detail screens.
 *
 * Usage:
 *   <DetailSection title="Report" fields={[
 *     {label: 'Reason', value: report.reason},
 *     {label: 'Status', value: <StatusPill status={report.status} />},
 *     {label: 'Notes', value: report.notes, fullWidth: true},
 *   ]} />
 *
 *   <DetailSection title="Photos">{customContent}</DetailSection>
 *
 * `fields` and `children` can be combined: fields render first, children
 * below them.
 *
 * @param {string} [title]
 * @param {ReactNode} [action]     - optional element on the right of the title
 * @param {Array<{label: string, value: any, fullWidth?: boolean, key?: string}>} [fields]
 *        value may be a string/number or a React element; null/undefined/''
 *        renders `emptyText`. fullWidth spans both columns (long text).
 * @param {1|2} [columns=2]
 * @param {string} [emptyText='—']
 * @param {boolean} [hideEmpty=false] - drop fields whose value is empty
 */
const DetailSection = ({
  title,
  action,
  fields,
  columns = 2,
  emptyText = '—',
  hideEmpty = false,
  children,
  style,
}) => {
  const visibleFields = (fields || []).filter(
    field => field && !(hideEmpty && isEmpty(field.value)),
  );

  return (
    <View style={[styles.section, style]}>
      {(!!title || !!action) && (
        <View style={styles.header}>
          {!!title && <Text style={styles.title}>{title.toUpperCase()}</Text>}
          {action}
        </View>
      )}
      {visibleFields.length > 0 && (
        <View style={styles.grid}>
          {visibleFields.map((field, index) => (
            <View
              key={field.key || `${field.label}-${index}`}
              style={[
                styles.cell,
                field.fullWidth || columns === 1 ? styles.cellFull : styles.cellHalf,
              ]}>
              <Text style={styles.label}>{field.label}</Text>
              {isEmpty(field.value) ? (
                <Text style={[styles.value, styles.emptyValue]}>
                  {emptyText}
                </Text>
              ) : typeof field.value === 'string' ||
                typeof field.value === 'number' ? (
                <Text style={styles.value} selectable>
                  {String(field.value)}
                </Text>
              ) : (
                field.value
              )}
            </View>
          ))}
        </View>
      )}
      {!!children && (
        <View style={visibleFields.length > 0 && styles.childrenSpaced}>
          {children}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: workhorse.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: workhorse.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.label,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: workhorse.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  cell: {
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  cellHalf: {width: '50%'},
  cellFull: {width: '100%'},
  label: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: workhorse.muted,
    marginBottom: 3,
  },
  value: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: workhorse.ink,
  },
  emptyValue: {color: workhorse.muted},
  childrenSpaced: {marginTop: spacing.xs},
});

export default DetailSection;
