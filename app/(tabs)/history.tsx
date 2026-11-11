import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { DayPickerModal } from '../../src/components/history/DayPickerModal';
import { DaySummary } from '../../src/components/history/DaySummary';
import { LoopHistoryRow } from '../../src/components/history/LoopHistoryRow';
import {
  addDaysToDayKey,
  currentDayKey,
  formatDayLabel,
  formatMonthLabel,
} from '../../src/domain/shared/dateUtils';
import { formatDurationCompact } from '../../src/domain/timer/timerEngine';
import {
  getDayHistory,
  getMonthHistory,
  type DayHistory,
  type MonthHistory,
} from '../../src/features/history/historyService';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const today = currentDayKey();

  const [selectedDay, setSelectedDay] = useState(today);
  const [dayHistory, setDayHistory] = useState<DayHistory | null>(null);
  const [monthHistory, setMonthHistory] = useState<MonthHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const monthKey = selectedDay.slice(0, 7);
      void Promise.all([getDayHistory(db, selectedDay), getMonthHistory(db, monthKey)])
        .then(([day, month]) => {
          if (!cancelled) {
            setDayHistory(day);
            setMonthHistory(month);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [db, selectedDay])
  );

  const isToday = selectedDay >= today;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>JOURNAL</Text>
        <Text style={[styles.title, { color: colors.text }]}>History</Text>
      </View>

      <View style={styles.dayNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => setSelectedDay((value) => addDaysToDayKey(value, -1))}
          hitSlop={10}
          style={[styles.navButton, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>

        <View style={styles.dayLabelWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Selected date: ${formatDayLabel(selectedDay)}. Choose another date.`}
            onPress={() => setPickerVisible(true)}
            hitSlop={8}
            style={styles.dayLabelButton}
          >
            <Text style={[styles.dayLabel, { color: colors.text }]}>
              {formatDayLabel(selectedDay)}
            </Text>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
          </Pressable>
          {!isToday ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
              onPress={() => setSelectedDay(today)}
            >
              <Text style={[styles.todayLink, { color: colors.accent }]}>
                Back to today
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.todayLabel, { color: colors.textSecondary }]}>
              Today
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => setSelectedDay((value) => addDaysToDayKey(value, 1))}
          disabled={isToday}
          hitSlop={10}
          style={[
            styles.navButton,
            { backgroundColor: colors.surface, opacity: isToday ? 0.35 : 1 },
          ]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      {loading && !dayHistory ? (
        <LoadingScreen />
      ) : dayHistory ? (
        <>
          <DaySummary
            totalSeconds={dayHistory.totalSeconds}
            loopCount={dayHistory.loopCount}
            daily={dayHistory.daily}
          />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Loops</Text>
            {dayHistory.loops.length === 0 ? (
              <View style={styles.emptyWrap}>
                <EmptyState
                  title="No loops on this day"
                  message="Completed and in-progress loops that overlapped this day will appear here."
                />
              </View>
            ) : (
              <View style={styles.list}>
                {dayHistory.loops.map((entry) => (
                  <LoopHistoryRow
                    key={entry.loop.id}
                    loop={entry.loop}
                    elapsedSeconds={entry.elapsedSeconds}
                    onPress={() => router.push(`/loop/${entry.loop.id}`)}
                  />
                ))}
              </View>
            )}
          </View>

          {monthHistory ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {formatMonthLabel(monthHistory.monthKey)}
              </Text>
              <View
                style={[
                  styles.monthCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.monthStats}>
                  <View style={styles.monthStat}>
                    <Text style={[styles.monthValue, { color: colors.text }]}>
                      {formatDurationCompact(monthHistory.totalSeconds)}
                    </Text>
                    <Text
                      style={[styles.monthLabel, { color: colors.textSecondary }]}
                    >
                      FOCUSED
                    </Text>
                  </View>
                  <View style={styles.monthStat}>
                    <Text style={[styles.monthValue, { color: colors.text }]}>
                      {monthHistory.loopCount}
                    </Text>
                    <Text
                      style={[styles.monthLabel, { color: colors.textSecondary }]}
                    >
                      LOOPS
                    </Text>
                  </View>
                  <View style={styles.monthStat}>
                    <Text
                      style={[
                        styles.monthValue,
                        {
                          color: monthHistory.monthly.progress.reached
                            ? colors.success
                            : colors.accent,
                        },
                      ]}
                    >
                      {monthHistory.monthly.intention
                        ? `${monthHistory.monthly.progress.percent}%`
                        : '—'}
                    </Text>
                    <Text
                      style={[styles.monthLabel, { color: colors.textSecondary }]}
                    >
                      OF INTENTION
                    </Text>
                  </View>
                </View>

                {monthHistory.monthly.intention ? (
                  <>
                    <View
                      style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
                    >
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${monthHistory.monthly.progress.percent}%`,
                            backgroundColor: monthHistory.monthly.progress.reached
                              ? colors.success
                              : colors.accent,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.monthMeta, { color: colors.textSecondary }]}>
                      {formatDurationCompact(monthHistory.monthly.actualSeconds)} of{' '}
                      {formatDurationCompact(
                        monthHistory.monthly.intention.target_duration_seconds
                      )}{' '}
                      intended
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.monthMeta, { color: colors.textSecondary }]}>
                    No monthly intention set.
                  </Text>
                )}
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      <DayPickerModal
        visible={pickerVisible}
        selectedDay={selectedDay}
        maxDay={today}
        onSelect={(dayKey) => {
          setSelectedDay(dayKey);
          setPickerVisible(false);
        }}
        onClose={() => setPickerVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabelWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  dayLabelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  todayLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  todayLink: {
    fontSize: 11,
    fontWeight: '700',
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  list: {
    gap: spacing.sm,
  },
  emptyWrap: {
    minHeight: 180,
  },
  monthCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  monthStats: {
    flexDirection: 'row',
  },
  monthStat: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  monthValue: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  monthLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
  monthMeta: {
    fontSize: 12,
  },
});
