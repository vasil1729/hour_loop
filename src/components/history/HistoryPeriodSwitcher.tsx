import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

export type HistoryPeriod = 'day' | 'week' | 'month';

const OPTIONS: { key: HistoryPeriod; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

type HistoryPeriodSwitcherProps = {
  period: HistoryPeriod;
  onChange: (period: HistoryPeriod) => void;
};

export function HistoryPeriodSwitcher({
  period,
  onChange,
}: HistoryPeriodSwitcherProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
      {OPTIONS.map((option) => {
        const selected = option.key === period;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} view`}
            onPress={() => onChange(option.key)}
            style={[
              styles.option,
              { backgroundColor: selected ? colors.accent : 'transparent' },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
});
