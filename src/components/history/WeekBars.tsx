import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatCompactDayLabel,
  formatWeekdayNarrow,
  formatWeekdayShort,
  parseDayKey,
} from '../../domain/shared/dateUtils';
import { formatDurationCompact } from '../../domain/timer/timerEngine';
import type { WeekDayHistory } from '../../features/history/historyService';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type WeekBarsProps = {
  days: WeekDayHistory[];
  selectedDay: string;
  today: string;
  onSelectDay: (dayKey: string) => void;
};

export function WeekBars({
  days,
  selectedDay,
  today,
  onSelectDay,
}: WeekBarsProps) {
  const { colors } = useTheme();
  const { language, t } = useTranslation();
  const maxSeconds = Math.max(1, ...days.map((day) => day.totalSeconds));

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('history.dailyBreakdown')}
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('common.tapADay')}
        </Text>
      </View>

      <View style={styles.row}>
        {days.map((day) => {
          const { day: dayNumber } = parseDayKey(day.dayKey);
          const isSelected = day.dayKey === selectedDay;
          const isToday = day.dayKey === today;
          const isFuture = day.dayKey > today;
          const fillHeight =
            day.totalSeconds > 0
              ? Math.max(4, Math.round((day.totalSeconds / maxSeconds) * 76))
              : 3;

          return (
            <Pressable
              key={day.dayKey}
              accessibilityRole="button"
              accessibilityLabel={t('weekBars.a11y', {
                day: formatCompactDayLabel(day.dayKey),
                duration: formatDurationCompact(day.totalSeconds),
              })}
              accessibilityState={{ selected: isSelected, disabled: isFuture }}
              disabled={isFuture}
              onPress={() => onSelectDay(day.dayKey)}
              style={[
                styles.column,
                isSelected && {
                  backgroundColor: colors.accentSoft,
                  borderColor: colors.accent,
                  borderWidth: StyleSheet.hairlineWidth,
                },
                { opacity: isFuture ? 0.35 : 1 },
              ]}
            >
              <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      height: fillHeight,
                      backgroundColor: colors.accent,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.weekday,
                  {
                    color: isToday ? colors.accent : colors.textSecondary,
                    fontWeight: isToday ? '700' : '600',
                  },
                ]}
              >
                {language === 'ar' || language === 'ml'
                  ? formatWeekdayNarrow(day.dayKey)
                  : language === 'zh' || language === 'tr'
                    ? formatWeekdayShort(day.dayKey)
                    : formatWeekdayShort(day.dayKey).slice(0, 2)}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  {
                    color: isSelected ? colors.accent : colors.text,
                    fontWeight: isSelected || isToday ? '800' : '600',
                  },
                ]}
              >
                {dayNumber}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.duration, { color: colors.textSecondary }]}
              >
                {formatDurationCompact(day.totalSeconds)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  track: {
    width: 18,
    height: 76,
    borderRadius: radius.full,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    borderRadius: radius.full,
  },
  weekday: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
  dayNumber: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  duration: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
});
