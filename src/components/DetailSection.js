import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ChevronDown, ChevronUp} from 'lucide-react-native';
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
 * @param {boolean} [collapsible=false] - header becomes a toggle; `fields`
 *        and `children` only render while expanded
 * @param {boolean} [defaultCollapsed=false] - initial state when collapsible
 * @param {ReactNode} [collapsedSummary] - shown under the title while
 *        collapsed (e.g. name + status pills), so the card still says who /
 *        what it is at a glance
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
  collapsible = false,
  defaultCollapsed = false,
  collapsedSummary,
}) => {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const isCollapsed = collapsible && collapsed;
  const visibleFields = (fields || []).filter(
    field => field && !(hideEmpty && isEmpty(field.value)),
  );

  const renderContent = () => (
    <>
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
    </>
  );

  if (collapsible) {
    const Chevron = isCollapsed ? ChevronDown : ChevronUp;
    return (
      <View style={[styles.section, style]}>
        <Pressable
          onPress={() => setCollapsed(value => !value)}
          style={({pressed}) => [
            styles.collapsibleHeader,
            !isCollapsed && styles.collapsibleHeaderOpen,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{expanded: !isCollapsed}}
          accessibilityLabel={title ? `${title}, ${isCollapsed ? 'expand' : 'collapse'}` : undefined}>
          <View style={styles.collapsibleHeaderMain}>
            <View style={styles.headerRow}>
              {!!title && <Text style={styles.title}>{title.toUpperCase()}</Text>}
              {action}
            </View>
            {isCollapsed && !!collapsedSummary && (
              <View style={styles.summary}>{collapsedSummary}</View>
            )}
          </View>
          <Chevron size={18} color={workhorse.muted} />
        </Pressable>
        {!isCollapsed && renderContent()}
      </View>
    );
  }

  return (
    <View style={[styles.section, style]}>
      {(!!title || !!action) && (
        <View style={styles.header}>
          {!!title && <Text style={styles.title}>{title.toUpperCase()}</Text>}
          {action}
        </View>
      )}
      {renderContent()}
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
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  collapsibleHeaderOpen: {marginBottom: spacing.md},
  collapsibleHeaderMain: {flex: 1},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summary: {marginTop: spacing.sm},
  pressed: {opacity: 0.68},
  childrenSpaced: {marginTop: spacing.xs},
});

export default DetailSection;
