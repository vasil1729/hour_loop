import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  addMonthsToMonthKey,
  formatDayLabel,
  formatMonthLabel,
  getMonthGrid,
  getWeekdayLabels,
  parseDayKey,
} from '../../domain/shared/dateUtils';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';
import { Button } from '../common/Button';

type DayPickerModalProps = {
  visible: boolean;
  selectedDay: string;
  maxDay: string;
  onSelect: (dayKey: string) => void;
  onClose: () => void;
};

export function DayPickerModal({
  visible,
  selectedDay,
  maxDay,
  onSelect,
  onClose,
}: DayPickerModalProps) {
  const { colors } = useTheme();
  const { t, isRTL, language } = useTranslation();
  const weekdayLabels = getWeekdayLabels(
    isRTL || language === 'ml' ? 'narrow' : 'short'
  );
  const [viewMonth, setViewMonth] = useState(selectedDay.slice(0, 7));
  const maxMonth = maxDay.slice(0, 7);

  useEffect(() => {
    if (visible) {
      setViewMonth(selectedDay.slice(0, 7));
    }
  }, [selectedDay, visible]);

  const weeks = getMonthGrid(viewMonth);
  const canGoNext = viewMonth < maxMonth;

  const goToPreviousMonth = () => {
    setViewMonth((value) => addMonthsToMonthKey(value, -1));
  };

  const goToNextMonth = () => {
    setViewMonth((value) => addMonthsToMonthKey(value, 1));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('dayPicker.closeA11y')}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('dayPicker.title')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={onClose}
              hitSlop={10}
            >
              <Text style={[styles.close, { color: colors.textSecondary }]}>
                {t('common.close')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.monthNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dayPicker.previousMonth')}
              onPress={goToPreviousMonth}
              hitSlop={8}
              style={[styles.monthButton, { backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={18} color={colors.text} />
            </Pressable>

            <Text style={[styles.monthLabel, { color: colors.text }]}>
              {formatMonthLabel(viewMonth)}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dayPicker.nextMonth')}
              accessibilityState={{ disabled: !canGoNext }}
              onPress={goToNextMonth}
              disabled={!canGoNext}
              hitSlop={8}
              style={[
                styles.monthButton,
                { backgroundColor: colors.surfaceAlt, opacity: canGoNext ? 1 : 0.35 },
              ]}
            >
              <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.text} />
            </Pressable>
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

          <View>
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
                  const isSelected = dayKey === selectedDay;
                  const isToday = dayKey === maxDay;
                  const isFuture = dayKey > maxDay;

                  return (
                    <Pressable
                      key={dayKey}
                      accessibilityRole="button"
                      accessibilityLabel={formatDayLabel(dayKey)}
                      accessibilityState={{
                        selected: isSelected,
                        disabled: isFuture,
                      }}
                      onPress={() => onSelect(dayKey)}
                      disabled={isFuture}
                      style={({ pressed }) => [
                        styles.dayCell,
                        { opacity: isFuture ? 0.3 : pressed ? 0.6 : 1 },
                      ]}
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
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <Button
            label={t('dayPicker.jumpToday')}
            variant="secondary"
            onPress={() => onSelect(maxDay)}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  close: {
    fontSize: 13,
    fontWeight: '600',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  monthButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});
