import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ChevronRight} from 'lucide-react-native';
import {workhorse} from '../constants/colors';
import fonts from '../constants/fonts';
import radius from '../constants/radius';
import spacing from '../constants/spacing';

/**
 * Generic tappable row / card for dense list screens.
 *
 *   [left]  title                [right]
 *           subtitle
 *           meta
 *
 * @param {string|ReactNode} title
 * @param {string|ReactNode} [subtitle]
 * @param {string|ReactNode} [meta]       - third line, e.g. a timestamp
 * @param {ReactNode} [left]              - icon / avatar slot
 * @param {ReactNode} [right]             - e.g. <StatusPill/>; defaults to a
 *                                          chevron when onPress is set
 * @param {boolean} [showChevron]         - force chevron on/off
 * @param {() => void} [onPress]          - omit for a non-tappable row
 * @param {'card'|'flat'} [variant]       - card = bordered rounded card with
 *                                          gap below; flat = full-width row
 *                                          with a bottom divider
 */
const ListRow = ({
  title,
  subtitle,
  meta,
  left,
  right,
  showChevron,
  onPress,
  variant = 'card',
  disabled = false,
  style,
  accessibilityLabel,
  testID,
}) => {
  const chevron = showChevron ?? (!!onPress && !right);
  const content = (
    <>
      {!!left && <View style={styles.left}>{left}</View>}
      <View style={styles.body}>
        {typeof title === 'string' ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
        {!!subtitle &&
          (typeof subtitle === 'string' ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          ))}
        {!!meta &&
          (typeof meta === 'string' ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : (
            meta
          ))}
      </View>
      {(!!right || chevron) && (
        <View style={styles.right}>
          {right}
          {chevron && <ChevronRight size={16} color={workhorse.muted} />}
        </View>
      )}
    </>
  );

  const containerStyle = [
    styles.row,
    variant === 'card' ? styles.card : styles.flat,
    style,
  ];

  if (!onPress) {
    return (
      <View style={containerStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({pressed}) => [containerStyle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel || (typeof title === 'string' ? title : undefined)
      }
      testID={testID}>
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    backgroundColor: workhorse.surface,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: workhorse.border,
    marginBottom: spacing.sm + 2,
  },
  flat: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: workhorse.border,
  },
  left: {alignItems: 'center', justifyContent: 'center'},
  body: {flex: 1, minWidth: 0},
  title: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: workhorse.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: workhorse.secondary,
    marginTop: 2,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: workhorse.muted,
    marginTop: spacing.xs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pressed: {opacity: 0.68},
});

export default ListRow;
