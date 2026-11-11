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
import {
  HistoryPeriodSwitcher,
  type HistoryPeriod,
} from '../../src/components/history/HistoryPeriodSwitcher';
import { LoopHistoryRow } from '../../src/components/history/LoopHistoryRow';
import { MonthHeatmap } from '../../src/components/history/MonthHeatmap';
import {
  PeriodSummary,
  type PeriodSummaryStat,
} from '../../src/components/history/PeriodSummary';
import { WeekBars } from '../../src/components/history/WeekBars';
import { formatIntentionDuration } from '../../src/domain/intentions/intentionsDomain';
import {
  addDaysToDayKey,
  addMonthsToMonthKey,
  currentDayKey,
  formatCompactDayLabel,
  formatMonthLabel,
  formatWeekRangeLabel,
  startOfWeekDayKey,
} from '../../src/domain/shared/dateUtils';
import { formatDurationCompact } from '../../src/domain/timer/timerEngine';
import {
  getDayHistory,
  getMonthHistory,
  getWeekHistory,
  type DayHistory,
  type MonthHistory,
  type WeekHistory,
} from '../../src/features/history/historyService';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const today = currentDayKey();

  const [period, setPeriod] = useState<HistoryPeriod>('day');
  const [selectedDay, setSelectedDay] = useState(today);
  const [dayHistory, setDayHistory] = useState<DayHistory | null>(null);
  const [weekHistory, setWeekHistory] = useState<WeekHistory | null>(null);
  const [monthHistory, setMonthHistory] = useState<MonthHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);

  const weekStart = startOfWeekDayKey(selectedDay);
  const weekEnd = addDaysToDayKey(weekStart, 6);
  const monthKey = selectedDay.slice(0, 7);
  const currentWeekStart = startOfWeekDayKey(today);
  const isCurrentPeriod =
    period === 'day'
      ? selectedDay === today
      : period === 'week'
        ? weekStart === currentWeekStart
        : monthKey === today.slice(0, 7);

  const periodLabel =
    period === 'day'
      ? formatCompactDayLabel(selectedDay)
      : period === 'week'
        ? formatWeekRangeLabel(weekStart, weekEnd)
        : formatMonthLabel(monthKey);

  const periodHint =
    period === 'day'
      ? isCurrentPeriod
        ? 'Today'
        : 'Back to today'
      : period === 'week'
        ? isCurrentPeriod
          ? 'This week'
          : 'Back to this week'
        : isCurrentPeriod
          ? 'This month'
          : 'Back to this month';

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);

      const load = async () => {
        if (period === 'day') {
          const result = await getDayHistory(db, selectedDay);
          if (!cancelled) setDayHistory(result);
        } else if (period === 'week') {
          const result = await getWeekHistory(db, selectedDay);
          if (!cancelled) setWeekHistory(result);
        } else {
          const result = await getMonthHistory(db, selectedDay.slice(0, 7));
          if (!cancelled) setMonthHistory(result);
        }
        if (!cancelled) setLoading(false);
      };

      void load().catch(() => {
        if (!cancelled) setLoading(false);
      });

      return () => {
        cancelled = true;
      };
    }, [db, period, selectedDay])
  );

  const shiftPeriod = (delta: number) => {
    if (period === 'day') {
      setSelectedDay((value) => addDaysToDayKey(value, delta));
      return;
    }
    if (period === 'week') {
      setSelectedDay((value) => addDaysToDayKey(value, delta * 7));
      return;
    }
    setSelectedDay(`${addMonthsToMonthKey(monthKey, delta)}-01`);
  };

  const goToCurrentPeriod = () => setSelectedDay(today);

  const selectDay = (dayKey: string) => {
    setSelectedDay(dayKey);
    setPeriod('day');
    setPickerVisible(false);
  };

  const currentData =
    period === 'day' ? dayHistory : period === 'week' ? weekHistory : monthHistory;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>JOURNAL</Text>
        <Text style={[styles.title, { color: colors.text }]}>History</Text>
      </View>

      <HistoryPeriodSwitcher period={period} onChange={setPeriod} />

      <View style={styles.periodNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Previous ${period}`}
          onPress={() => shiftPeriod(-1)}
          hitSlop={10}
          style={[styles.navButton, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>

        <View style={styles.periodBody}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Selected ${period}: ${periodLabel}. Choose another date.`}
            onPress={() => setPickerVisible(true)}
            hitSlop={8}
            style={styles.periodLabelButton}
          >
            <Text
              numberOfLines={2}
              style={[styles.periodLabel, { color: colors.text }]}
            >
              {periodLabel}
            </Text>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={colors.textSecondary}
            />
          </Pressable>
          {isCurrentPeriod ? (
            <Text style={[styles.periodHint, { color: colors.textSecondary }]}>
              {periodHint}
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to current period"
              onPress={goToCurrentPeriod}
            >
              <Text style={[styles.periodLink, { color: colors.accent }]}>
                {periodHint}
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Next ${period}`}
          onPress={() => shiftPeriod(1)}
          disabled={isCurrentPeriod}
          hitSlop={10}
          style={[
            styles.navButton,
            {
              backgroundColor: colors.surface,
              opacity: isCurrentPeriod ? 0.35 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      {loading && !currentData ? (
        <LoadingScreen />
      ) : period === 'day' && dayHistory ? (
        <>
          <DaySummary
            totalSeconds={dayHistory.totalSeconds}
            loopCount={dayHistory.loopCount}
            daily={dayHistory.daily}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open the detailed day timeline"
            onPress={() =>
              router.push({
                pathname: '/day/[date]',
                params: { date: selectedDay },
              })
            }
            style={styles.timelineLink}
          >
            <Text style={[styles.timelineLinkText, { color: colors.accent }]}>
              Open day timeline
            </Text>
            <Ionicons name="arrow-forward" size={14} color={colors.accent} />
          </Pressable>

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
        </>
      ) : period === 'week' && weekHistory ? (
        <>
          <PeriodSummary
            stats={weekStats(weekHistory)}
            progress={
              weekHistory.targetDayCount > 0
                ? {
                    percent: Math.round(
                      (weekHistory.targetDays / weekHistory.targetDayCount) * 100
                    ),
                    reached:
                      weekHistory.targetDays === weekHistory.targetDayCount,
                    label: `${weekHistory.targetDays} of ${weekHistory.targetDayCount} days on target`,
                  }
                : undefined
            }
            meta={`${weekHistory.activeDays} active ${
              weekHistory.activeDays === 1 ? 'day' : 'days'
            } · avg ${formatDurationCompact(
              weekHistory.activeDays > 0
                ? Math.round(
                    weekHistory.totalSeconds / weekHistory.activeDays
                  )
                : 0
            )}/day`}
          />
          <WeekBars
            days={weekHistory.days}
            selectedDay={selectedDay}
            today={today}
            onSelectDay={selectDay}
          />
        </>
      ) : period === 'month' && monthHistory ? (
        <>
          <PeriodSummary
            stats={monthStats(monthHistory)}
            progress={
              monthHistory.monthly.targetSeconds > 0
                ? {
                    percent: monthHistory.monthly.progress.percent,
                    reached: monthHistory.monthly.progress.reached,
                    label: `${
                      monthHistory.monthly.isDefault ? 'Default target · ' : ''
                    }${formatIntentionDuration(
                      monthHistory.monthly.actualSeconds
                    )} of ${formatIntentionDuration(
                      monthHistory.monthly.targetSeconds
                    )}`,
                  }
                : undefined
            }
            meta={`${monthHistory.activeDays} active ${
              monthHistory.activeDays === 1 ? 'day' : 'days'
            }${
              monthHistory.monthly.targetSeconds > 0
                ? ` · ${formatIntentionDuration(
                    monthHistory.monthly.progress.remainingSeconds
                  )} to go`
                : ''
            }`}
          />
          <MonthHeatmap
            monthKey={monthKey}
            days={monthHistory.days}
            selectedDay={selectedDay}
            today={today}
            onSelectDay={selectDay}
          />
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

function weekStats(week: WeekHistory): PeriodSummaryStat[] {
  return [
    { label: 'FOCUSED', value: formatDurationCompact(week.totalSeconds) },
    { label: 'LOOPS', value: String(week.loopCount) },
    {
      label: 'ON TARGET',
      value:
        week.targetDayCount > 0
          ? `${week.targetDays}/${week.targetDayCount}`
          : '—',
      tone:
        week.targetDayCount > 0 &&
        week.targetDays === week.targetDayCount
          ? 'success'
          : 'accent',
    },
  ];
}

function monthStats(month: MonthHistory): PeriodSummaryStat[] {
  return [
    { label: 'FOCUSED', value: formatDurationCompact(month.totalSeconds) },
    { label: 'LOOPS', value: String(month.loopCount) },
    {
      label: 'OF INTENTION',
      value:
        month.monthly.targetSeconds > 0
          ? `${month.monthly.progress.percent}%`
          : '—',
      tone: month.monthly.progress.reached ? 'success' : 'accent',
    },
  ];
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
  periodNav: {
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
  periodBody: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  periodLabelButton: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  periodLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  periodHint: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  periodLink: {
    fontSize: 11,
    fontWeight: '700',
  },
  timelineLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  timelineLinkText: {
    fontSize: 13,
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
});
