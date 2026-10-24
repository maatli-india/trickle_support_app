import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {workhorse} from '../constants/colors';
import fonts from '../constants/fonts';
import radius from '../constants/radius';
import spacing from '../constants/spacing';

/**
 * Single-select chip group — a lightweight picker (no native picker
 * dependency). Used for the reports status filter and the admin form's
 * status/resolution pickers.
 *
 * @param {Array<{value: string, label: string}>} options
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @param {boolean} [scroll=false] - one horizontal scrolling row (filters)
 *                                   instead of wrapping (form fields)
 */
const ChipSelect = ({
  options,
  value,
  onChange,
  scroll = false,
  disabled = false,
  style,
  contentContainerStyle,
}) => {
  const chips = options.map(option => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value || '__none'}
        onPress={() => !disabled && onChange(option.value)}
        disabled={disabled}
        style={({pressed}) => [
          styles.chip,
          selected && styles.chipSelected,
          disabled && styles.chipDisabled,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{selected, disabled}}
        accessibilityLabel={option.label}>
        <Text
          style={[styles.chipText, selected && styles.chipTextSelected]}
          numberOfLines={1}>
          {option.label}
        </Text>
      </Pressable>
    );
  });

  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={style}
        contentContainerStyle={[styles.row, contentContainerStyle]}>
        {chips}
      </ScrollView>
    );
  }
  return <View style={[styles.row, styles.wrap, style]}>{chips}</View>;
};

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: spacing.sm},
  wrap: {flexWrap: 'wrap'},
  chip: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: workhorse.border,
    backgroundColor: workhorse.surface,
  },
  chipSelected: {
    backgroundColor: workhorse.ink,
    borderColor: workhorse.ink,
  },
  chipDisabled: {opacity: 0.5},
  chipText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: workhorse.inkSoft,
  },
  chipTextSelected: {color: workhorse.surface, fontWeight: '600'},
  pressed: {opacity: 0.7},
});

export default ChipSelect;
