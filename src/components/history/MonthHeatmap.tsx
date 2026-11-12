import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatCompactDayLabel,
  getMonthGrid,
  getWeekdayLabels,
  parseDayKey,
} from '../../domain/shared/dateUtils';
import { formatDurationCompact } from '../../domain/timer/timerEngine';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type MonthHeatmapProps = {
  monthKey: string;
  days: Record<string, number>;
  selectedDay: string;
  today: string;
  onSelectDay: (dayKey: string) => void;
};

export function MonthHeatmap({
  monthKey,
  days,
  selectedDay,
  today,
  onSelectDay,
}: MonthHeatmapProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const weeks = getMonthGrid(monthKey);
  const weekdayLabels = getWeekdayLabels('narrow');
  const maxSeconds = Math.max(1, ...Object.values(days));

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('history.dailyMap')}
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('common.tapADay')}
        </Text>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            style={[styles.weekday, { color: colors.textSecondary }]}
          >
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={`week-${weekIndex}`} style={styles.weekRow}>
          {week.map((dayKey, dayIndex) => {
            if (!dayKey) {
              return (
                <View
                  key={`empty-${weekIndex}-${dayIndex}`}
                  style={styles.dayCell}
                />
              );
            }

            const { day } = parseDayKey(dayKey);
            const seconds = days[dayKey] ?? 0;
            const ratio = seconds / maxSeconds;
            const isSelected = dayKey === selectedDay;
            const isToday = dayKey === today;
            const isFuture = dayKey > today;
            const dotSize = seconds > 0 ? 4 + Math.round(ratio * 6) : 0;

            return (
              <Pressable
                key={dayKey}
                accessibilityRole="button"
                accessibilityLabel={t('monthHeatmap.a11y', {
                  day: formatCompactDayLabel(dayKey),
                  duration: formatDurationCompact(seconds),
                })}
                accessibilityState={{ selected: isSelected, disabled: isFuture }}
                disabled={isFuture}
                onPress={() => onSelectDay(dayKey)}
                style={[styles.dayCell, { opacity: isFuture ? 0.3 : 1 }]}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isSelected && { backgroundColor: colors.accent },
                    !isSelected &&
                      isToday && {
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.accent,
                      },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      {
                        color: isSelected
                          ? '#FFFFFF'
                          : isToday
                            ? colors.accent
                            : colors.text,
                        fontWeight: isToday || isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {day}
                  </Text>
                  {dotSize > 0 ? (
                    <View
                      style={[
                        {
                          width: dotSize,
                          height: dotSize,
                          borderRadius: dotSize / 2,
                          backgroundColor: isSelected
                            ? '#FFFFFF'
                            : colors.accent,
                          opacity: isSelected ? 0.9 : 0.5 + ratio * 0.5,
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>
          {t('common.less')}
        </Text>
        {[0.35, 0.6, 0.85, 1].map((opacity, index) => (
          <View
            key={index}
            style={[
              styles.legendDot,
              {
                backgroundColor: colors.accent,
                opacity,
              },
            ]}
          />
        ))}
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>
          {t('common.more')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
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
  weekdayRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dayText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: spacing.xs,
  },
  legendText: {
    fontSize: 9,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
