import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/types';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

export type HistoryPeriod = 'day' | 'week' | 'month';

const OPTIONS: { key: HistoryPeriod; labelKey: TranslationKey }[] = [
  { key: 'day', labelKey: 'history.periodDay' },
  { key: 'week', labelKey: 'history.periodWeek' },
  { key: 'month', labelKey: 'history.periodMonth' },
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
  const { t } = useTranslation();

  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
      {OPTIONS.map((option) => {
        const selected = option.key === period;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t('history.view', {
              label: t(option.labelKey),
            })}
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
              {t(option.labelKey)}
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
