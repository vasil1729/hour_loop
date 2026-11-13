import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { DayPickerModal } from '../../src/components/history/DayPickerModal';
import {
  HistoryPeriodSwitcher,
  type HistoryPeriod,
} from '../../src/components/history/HistoryPeriodSwitcher';
import {
  addDaysToDayKey,
  addMonthsToMonthKey,
  currentDayKey,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRangeLabel,
  getDeviceTimeZone,
  getZonedParts,
  startOfWeekDayKey,
} from '../../src/domain/shared/dateUtils';
import { formatDurationCompact } from '../../src/domain/timer/timerEngine';
import {
  getDayCapsuleData,
  getRangeCapsuleData,
  type CapsulePeriodData,
  type DayCapsuleData,
  type DayCapsuleTotal,
} from '../../src/features/days/dayCapsuleService';
import { getActiveLanguage } from '../../src/i18n';
import { useTranslation } from '../../src/i18n/I18nProvider';
import type {
  TranslationKey,
  TranslationParams,
} from '../../src/i18n/types';
import { capsuleColor } from '../../src/theme/capsuleColors';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

const HOUR_HEIGHT = 58;

function hourLabels(): string[] {
  const use12Hour = getActiveLanguage() === 'en';
  return Array.from({ length: 24 }, (_, hour) => {
    if (!use12Hour) return `${String(hour).padStart(2, '0')}:00`;
    const suffix = hour < 12 ? 'AM' : 'PM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display} ${suffix}`;
  });
}

type ViewMode = 'timeline' | 'clock';

function minutesOfDay(iso: string, timeZone: string): number {
  const parts = getZonedParts(new Date(iso), timeZone);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

type TaskGroup = {
  key: string;
  title: string;
  parentTitle: string | null;
  totalSeconds: number;
  items: DayCapsuleTotal[];
  loose: boolean;
};

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

function buildTaskGroups(
  capsules: DayCapsuleTotal[],
  t: Translate
): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const loose: DayCapsuleTotal[] = [];

  for (const capsule of capsules) {
    if (!capsule.taskId) {
      loose.push(capsule);
      continue;
    }
    const existing = groups.get(capsule.taskId);
    if (existing) {
      existing.items.push(capsule);
      existing.totalSeconds += capsule.seconds;
    } else {
      groups.set(capsule.taskId, {
        key: capsule.taskId,
        title: capsule.taskTitle ?? t('day.taskCapsuleFallback'),
        parentTitle: capsule.parentTaskTitle,
        totalSeconds: capsule.seconds,
        items: [capsule],
        loose: false,
      });
    }
  }

  const result = [...groups.values()].sort(
    (a, b) =>
      b.totalSeconds - a.totalSeconds || a.title.localeCompare(b.title)
  );
  for (const group of result) {
    group.items.sort(
      (a, b) => b.seconds - a.seconds || a.text.localeCompare(b.text)
    );
  }

  if (loose.length > 0) {
    loose.sort((a, b) => b.seconds - a.seconds || a.text.localeCompare(b.text));
    result.push({
      key: 'loose',
      title: t('day.looseCapsules'),
      parentTitle: null,
      totalSeconds: loose.reduce((sum, item) => sum + item.seconds, 0),
      items: loose,
      loose: true,
    });
  }

  return result;
}

export default function DayViewScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, isRTL } = useTranslation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = currentDayKey();
  const [selectedDay, setSelectedDay] = useState(
    typeof params.date === 'string' ? params.date : today
  );
  const [period, setPeriod] = useState<HistoryPeriod>('day');
  const [data, setData] = useState<CapsulePeriodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [timelineTop, setTimelineTop] = useState(0);

  const monthKey = selectedDay.slice(0, 7);
  const weekStart = startOfWeekDayKey(selectedDay);
  const weekEnd = addDaysToDayKey(weekStart, 6);
  const rangeStart =
    period === 'day'
      ? selectedDay
      : period === 'week'
        ? weekStart
        : `${monthKey}-01`;
  const rangeEnd =
    period === 'day'
      ? selectedDay
      : period === 'week'
        ? weekEnd
        : addDaysToDayKey(`${addMonthsToMonthKey(monthKey, 1)}-01`, -1);

  const periodLabel =
    period === 'day'
      ? formatDayLabel(selectedDay)
      : period === 'week'
        ? formatWeekRangeLabel(weekStart, weekEnd)
        : formatMonthLabel(monthKey);

  const periodName =
    period === 'day'
      ? t('history.periodDay')
      : period === 'week'
        ? t('history.periodWeek')
        : t('history.periodMonth');

  const currentWeekStart = startOfWeekDayKey(today);
  const isCurrentPeriod =
    period === 'day'
      ? selectedDay === today
      : period === 'week'
        ? weekStart === currentWeekStart
        : monthKey === today.slice(0, 7);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const request =
        period === 'day'
          ? getDayCapsuleData(db, selectedDay)
          : getRangeCapsuleData(db, rangeStart, rangeEnd);
      void request
        .then((result) => {
          if (!cancelled) setData(result);
        })
        .catch(() => {
          if (!cancelled) setData(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [db, period, rangeEnd, rangeStart, selectedDay])
  );

  const colorByItem = useMemo(() => {
    // Sort by item id so a capsule keeps its color while live durations change.
    const itemIds = Array.from(
      new Set((data?.capsules ?? []).map((capsule) => capsule.itemId))
    ).sort();
    return new Map(
      itemIds.map((itemId, index) => [itemId, capsuleColor(index)])
    );
  }, [data]);

  const groups = useMemo(
    () => buildTaskGroups(data?.capsules ?? [], t),
    [data, t]
  );
  const selectedCapsule =
    data?.capsules.find((capsule) => capsule.itemId === selectedItemId) ?? null;
  const selectedColor = selectedCapsule
    ? colorByItem.get(selectedCapsule.itemId) ?? colors.accent
    : colors.accent;

  useEffect(() => {
    setSelectedItemId(null);
  }, [period, selectedDay]);

  const isToday = selectedDay === today;
  const timeZone = getDeviceTimeZone();

  const toggleSelectedItem = (itemId: string) => {
    setSelectedItemId((current) => (current === itemId ? null : itemId));
  };

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

  const jumpToTimeline = () => {
    const first = data?.segments[0];
    const now = new Date();
    const minutes = isToday
      ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
      : first
        ? minutesOfDay(first.startAt, timeZone)
        : 0;
    const y = timelineTop + (minutes / 60) * HOUR_HEIGHT - 24;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  };

  return (
    <Screen scroll={false}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('day.back')}
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.text} />
          </Pressable>
          <View style={styles.topBarTitle}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
              {t('day.eyebrow')}
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.title, { color: colors.text }]}
            >
              {periodLabel}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('day.chooseDate')}
            onPress={() => setPickerVisible(true)}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Ionicons name="calendar-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        <HistoryPeriodSwitcher period={period} onChange={setPeriod} />

        <View style={styles.dayNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('history.previousPeriod', {
              period: periodName,
            })}
            onPress={() => shiftPeriod(-1)}
            hitSlop={10}
            style={[styles.navButton, { backgroundColor: colors.surface }]}
          >
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={18} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('history.nextPeriod', {
              period: periodName,
            })}
            disabled={isCurrentPeriod}
            onPress={() => shiftPeriod(1)}
            hitSlop={10}
            style={[
              styles.navButton,
              {
                backgroundColor: colors.surface,
                opacity: isCurrentPeriod ? 0.35 : 1,
              },
            ]}
          >
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.text} />
          </Pressable>
          {!isCurrentPeriod ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('day.jumpToday')}
              onPress={() => setSelectedDay(today)}
            >
              <Text style={[styles.todayLink, { color: colors.accent }]}>
                {t('day.today')}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.todayLabel, { color: colors.textSecondary }]}>
              {t('day.today')}
            </Text>
          )}
          <View style={styles.navSpacer} />
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
            {t('day.focused', {
              duration: formatDurationCompact(data?.totalSeconds ?? 0),
            })}
          </Text>
        </View>

        {loading && !data ? (
          <LoadingScreen />
        ) : !data ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title={t('day.noCapsuleTitle')}
              message={t('day.noCapsuleMessage')}
            />
          </View>
        ) : (
          <>
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>
                    {formatDurationCompact(data.totalSeconds)}
                  </Text>
                  <Text
                    style={[styles.summaryLabel, { color: colors.textSecondary }]}
                  >
                    {t('day.focusedLabel')}
                  </Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>
                    {groups.filter((group) => !group.loose).length}
                  </Text>
                  <Text
                    style={[styles.summaryLabel, { color: colors.textSecondary }]}
                  >
                    {t('day.tasks')}
                  </Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>
                    {data.capsules.length}
                  </Text>
                  <Text
                    style={[styles.summaryLabel, { color: colors.textSecondary }]}
                  >
                    {t('day.capsules')}
                  </Text>
                </View>
              </View>
            </View>

            {data.capsules.length === 0 ? (
              period === 'day' ? (
                <View style={styles.emptyHint}>
                  <Text style={[styles.emptyHintTitle, { color: colors.text }]}>
                    {t('day.noCapsuleTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.emptyHintBody,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {t('day.noCapsuleMessage')}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <EmptyState
                    title={t('day.noPeriodCapsuleTitle')}
                    message={t('day.noPeriodCapsuleMessage')}
                  />
                </View>
              )
            ) : (
            <View style={styles.taskSection}>
              <View style={styles.taskSectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('day.tasks')}
                </Text>
                <Text
                  style={[styles.sectionMeta, { color: colors.textSecondary }]}
                >
                  {t('day.taskCapsulesCount', {
                    count: groups.filter((group) => !group.loose).length,
                  })}
                </Text>
              </View>

              {groups.map((group) => (
                <View
                  key={group.key}
                  style={[
                    styles.taskGroup,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.taskGroupHeader}>
                    <View style={styles.taskGroupTitleBlock}>
                      <View style={styles.groupDots}>
                        {group.items.slice(0, 4).map((item) => (
                          <View
                            key={item.itemId}
                            style={[
                              styles.groupDot,
                              {
                                backgroundColor:
                                  colorByItem.get(item.itemId) ?? colors.accent,
                              },
                            ]}
                          />
                        ))}
                        {group.items.length > 4 ? (
                          <Text
                            style={[
                              styles.groupMore,
                              { color: colors.textSecondary },
                            ]}
                          >
                            +{group.items.length - 4}
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[styles.taskTitle, { color: colors.text }]}
                      >
                        {group.title}
                      </Text>
                      {group.parentTitle ? (
                        <Text
                          numberOfLines={1}
                          style={[styles.taskParent, { color: colors.textSecondary }]}
                        >
                          {group.parentTitle}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.taskGroupTotalBlock}>
                      <Text style={[styles.taskGroupTotal, { color: colors.text }]}>
                        {formatDurationCompact(group.totalSeconds)}
                      </Text>
                      <Text
                        style={[styles.taskGroupCount, { color: colors.textSecondary }]}
                      >
                        {t('day.capsuleCount', {
                          count: group.items.length,
                        })}
                      </Text>
                    </View>
                  </View>

                  {group.items.map((item) => {
                    const selected =
                      period === 'day' && selectedItemId === item.itemId;
                    const color = colorByItem.get(item.itemId) ?? colors.accent;
                    return (
                      <Pressable
                        key={item.itemId}
                        accessibilityRole={
                          period === 'day' ? 'button' : undefined
                        }
                        accessibilityState={
                          period === 'day' ? { selected } : undefined
                        }
                        accessibilityLabel={
                          period === 'day'
                            ? t('day.capsuleA11y', {
                                text: item.text,
                                duration: formatDurationCompact(item.seconds),
                                selected: selected
                                  ? `, ${t('day.selected')}`
                                  : '',
                              })
                            : undefined
                        }
                        disabled={period !== 'day'}
                        onPress={() => {
                          toggleSelectedItem(item.itemId);
                        }}
                        style={[
                          styles.capsuleRow,
                          {
                            backgroundColor: selected
                              ? colors.surfaceAlt
                              : 'transparent',
                            borderColor: selected ? color : 'transparent',
                          },
                        ]}
                      >
                        <View
                          style={[styles.colorDot, { backgroundColor: color }]}
                        />
                        <View style={styles.capsuleBody}>
                          <Text
                            numberOfLines={1}
                            style={[styles.capsuleText, { color: colors.text }]}
                          >
                            {item.text}
                          </Text>
                          <Text
                            style={[
                              styles.capsuleMeta,
                              { color: colors.textSecondary },
                            ]}
                          >
                            H{item.loopSequence}
                          </Text>
                        </View>
                        <Text
                          style={[styles.capsuleDuration, { color: colors.text }]}
                        >
                          {formatDurationCompact(item.seconds)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              </View>
            )}

            {period === 'day' ? (
              <>
                <View
                  style={[
                    styles.viewToggle,
                    { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  {(
                    [
                      ['timeline', t('day.timeline')],
                      ['clock', t('day.clock')],
                    ] as const
                  ).map(([mode, label]) => {
                const selected = viewMode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setViewMode(mode)}
                    style={[
                      styles.viewToggleOption,
                      {
                        backgroundColor: selected
                          ? colors.accent
                          : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.viewToggleText,
                        {
                          color: selected ? '#FFFFFF' : colors.textSecondary,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {data.capsules.length > 0 ? (
              selectedCapsule ? (
              <View
                style={[
                  styles.selectionCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: selectedColor,
                  },
                ]}
              >
                <View
                  style={[styles.colorDot, { backgroundColor: selectedColor }]}
                />
                <View style={styles.selectionBody}>
                  <Text
                    numberOfLines={1}
                    style={[styles.selectionTitle, { color: colors.text }]}
                  >
                    {selectedCapsule.text}
                  </Text>
                  <Text
                    style={[styles.selectionMeta, { color: colors.textSecondary }]}
                  >
                    {selectedCapsule.taskTitle ?? t('day.looseCapsule')} ·{' '}
                    {formatDurationCompact(selectedCapsule.seconds)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('day.clearHighlightA11y')}
                  onPress={() => setSelectedItemId(null)}
                  hitSlop={8}
                >
                  <Text style={[styles.selectionClear, { color: colors.accent }]}>
                    {t('day.clear')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.selectionHint, { color: colors.textSecondary }]}>
                {t('day.selectionHint')}
              </Text>
            )
            ) : null}

            {viewMode === 'timeline' ? (
              <>
                <View style={styles.timelineActions}>
                  <Text
                    style={[styles.timelineHint, { color: colors.textSecondary }]}
                  >
                    {t('day.scroll')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isToday ? t('day.jumpNow') : t('day.jumpFirst')
                    }
                    onPress={jumpToTimeline}
                    hitSlop={8}
                  >
                    <Text style={[styles.jumpLink, { color: colors.accent }]}>
                      {isToday ? t('day.jumpNow') : t('day.jumpFirst')}
                    </Text>
                  </Pressable>
                </View>
                <View
                  onLayout={(event) => {
                    setTimelineTop(event.nativeEvent.layout.y);
                  }}
                >
                  <TimelineView
                    data={data}
                    colorByItem={colorByItem}
                    timeZone={timeZone}
                    isToday={isToday}
                    selectedItemId={selectedItemId}
                    onSelectItem={toggleSelectedItem}
                  />
                </View>
              </>
            ) : (
              <ClockView
                data={data}
                colorByItem={colorByItem}
                timeZone={timeZone}
                width={width}
                isToday={isToday}
                selectedItemId={selectedItemId}
                onSelectItem={toggleSelectedItem}
              />
            )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
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

function TimelineView({
  data,
  colorByItem,
  timeZone,
  isToday,
  selectedItemId,
  onSelectItem,
}: {
  data: DayCapsuleData;
  colorByItem: Map<string, string>;
  timeZone: string;
  isToday: boolean;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const now = new Date();
  const nowMinutes =
    isToday ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 : -1;

  return (
    <View style={styles.timelineWrap}>
      <View style={styles.hourLabels}>
        {hourLabels().map((label) => (
          <View key={label} style={styles.hourLabelCell}>
            <Text style={[styles.hourLabel, { color: colors.textSecondary }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View
        style={[
          styles.timelineTrack,
          {
            height: HOUR_HEIGHT * 24,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {hourLabels().map((label, hour) => (
          <View
            key={label}
            pointerEvents="none"
            style={[
              styles.hourLine,
              {
                top: hour * HOUR_HEIGHT,
                backgroundColor: colors.border,
              },
            ]}
          />
        ))}
        {data.segments.map((segment, index) => {
          const startMinutes = minutesOfDay(segment.startAt, timeZone);
          const endMinutes = minutesOfDay(segment.endAt, timeZone);
          const durationMinutes =
            endMinutes > startMinutes
              ? endMinutes - startMinutes
              : segment.seconds / 60;
          const height = Math.max(8, (durationMinutes / 60) * HOUR_HEIGHT);
          const color =
            colorByItem.get(segment.itemId) ?? colors.accent;
          const capsule = data.capsules.find(
            (entry) => entry.itemId === segment.itemId
          );
          const showText = height >= 28;
          const selected = selectedItemId === segment.itemId;
          const dimmed = selectedItemId !== null && !selected;
          return (
            <Pressable
              key={`${segment.itemId}-${segment.startAt}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={t('day.capsuleA11y', {
                text: capsule?.text ?? t('day.capsuleFallback'),
                duration: formatDurationCompact(segment.seconds),
                selected: selected ? `, ${t('day.highlighted')}` : '',
              })}
              onPress={() => onSelectItem(segment.itemId)}
              style={[
                styles.timelineBlock,
                {
                  top: (startMinutes / 60) * HOUR_HEIGHT,
                  height,
                  backgroundColor: color,
                  opacity: dimmed ? 0.25 : 1,
                  borderWidth: selected ? 1.5 : 0,
                  borderColor: selected ? '#FFFFFF' : 'transparent',
                },
              ]}
            >
              {showText ? (
                <Text numberOfLines={2} style={styles.timelineBlockText}>
                  {capsule?.text ?? t('day.capsuleFallback')}
                  {height >= 44
                    ? ` · ${formatDurationCompact(segment.seconds)}`
                    : ''}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {nowMinutes >= 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.nowLine,
              {
                top: (nowMinutes / 60) * HOUR_HEIGHT,
                backgroundColor: colors.danger,
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

function ClockView({
  data,
  colorByItem,
  timeZone,
  width,
  isToday,
  selectedItemId,
  onSelectItem,
}: {
  data: DayCapsuleData;
  colorByItem: Map<string, string>;
  timeZone: string;
  width: number;
  isToday: boolean;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const size = Math.min(Math.max(width - 72, 240), 360);
  const center = size / 2;
  const outerRadius = center - 14;
  const dataRadius = outerRadius - 32;
  const labelRadius = outerRadius - 16;
  const selected =
    data.capsules.find((capsule) => capsule.itemId === selectedItemId) ?? null;
  const now = new Date();
  const nowMinutes = isToday
    ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
    : -1;

  const point = (minutes: number, r: number) => {
    const angle = (minutes / 1440) * Math.PI * 2;
    return {
      x: center + r * Math.sin(angle),
      y: center - r * Math.cos(angle),
    };
  };

  return (
    <View style={styles.clockWrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
          <Circle
            cx={center}
            cy={center}
            r={dataRadius}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />

          {Array.from({ length: 96 }, (_, index) => {
            const minutes = index * 15;
            const hourTick = index % 4 === 0;
            const outer = point(minutes, outerRadius);
            const inner = point(minutes, outerRadius - (hourTick ? 8 : 4));
            return (
              <Line
                key={minutes}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={hourTick ? colors.textSecondary : colors.border}
                strokeWidth={hourTick ? 2 : 1}
              />
            );
          })}

          {Array.from({ length: 12 }, (_, index) => {
            const hour = index * 2;
            const position = point(hour * 60, labelRadius);
            return (
              <SvgText
                key={hour}
                x={position.x}
                y={position.y + 3}
                fill={colors.textSecondary}
                fontSize={9}
                fontWeight="600"
                textAnchor="middle"
              >
                {String(hour).padStart(2, '0')}
              </SvgText>
            );
          })}

          {data.segments.map((segment, index) => {
            const start = minutesOfDay(segment.startAt, timeZone);
            const end = minutesOfDay(segment.endAt, timeZone);
            const arcMinutes = Math.max(1, end - start);
            const largeArc = arcMinutes > 720 ? 1 : 0;
            const startPoint = point(start, dataRadius);
            const endPoint = point(start + arcMinutes, dataRadius);
            const color = colorByItem.get(segment.itemId) ?? colors.accent;
            const isSelected = selectedItemId === segment.itemId;
            const dimmed = selectedItemId !== null && !isSelected;

            return (
              <Path
                key={`${segment.itemId}-${segment.startAt}-${index}`}
                d={`M ${center} ${center} L ${startPoint.x} ${startPoint.y} A ${dataRadius} ${dataRadius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y} Z`}
                fill={color}
                fillOpacity={dimmed ? 0.18 : 0.9}
                stroke={isSelected ? '#FFFFFF' : color}
                strokeWidth={isSelected ? 2 : 1}
                onPress={() => onSelectItem(segment.itemId)}
              />
            );
          })}

          {nowMinutes >= 0 ? (
            <>
              <Line
                x1={point(nowMinutes, dataRadius - 4).x}
                y1={point(nowMinutes, dataRadius - 4).y}
                x2={point(nowMinutes, outerRadius).x}
                y2={point(nowMinutes, outerRadius).y}
                stroke={colors.danger}
                strokeWidth={2}
              />
              <Circle
                cx={point(nowMinutes, outerRadius).x}
                cy={point(nowMinutes, outerRadius).y}
                r={3}
                fill={colors.danger}
              />
            </>
          ) : null}
        </Svg>

        <View pointerEvents="none" style={styles.clockCenter}>
          <Text style={[styles.clockTotal, { color: colors.text }]}>
            {formatDurationCompact(selected?.seconds ?? data.totalSeconds)}
          </Text>
          <Text style={[styles.clockLabel, { color: colors.textSecondary }]}>
            {selected ? t('day.selectedLabel') : t('day.focusedLabel')}
          </Text>
        </View>
      </View>
      <Text style={[styles.clockHint, { color: colors.textSecondary }]}>
        {selected
          ? t('day.clockHintSelected', {
              text: selected.text,
              duration: formatDurationCompact(selected.seconds),
            })
          : t('day.clockHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  navSpacer: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  emptyWrap: {
    minHeight: 260,
    justifyContent: 'center',
  },
  emptyHint: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  emptyHintTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyHintBody: {
    maxWidth: 320,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  summaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionMeta: {
    fontSize: 11,
    fontWeight: '600',
  },
  taskSection: {
    gap: spacing.sm,
  },
  taskSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  taskGroup: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  taskGroupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  taskGroupTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  groupDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupMore: {
    fontSize: 9,
    fontWeight: '700',
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  taskParent: {
    fontSize: 11,
    fontWeight: '500',
  },
  taskGroupTotalBlock: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 2,
  },
  taskGroupTotal: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  taskGroupCount: {
    fontSize: 10,
    fontWeight: '600',
  },
  capsuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  capsuleBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  capsuleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  capsuleMeta: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  capsuleDuration: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  selectionBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  selectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectionMeta: {
    fontSize: 11,
  },
  selectionClear: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectionHint: {
    fontSize: 11,
    textAlign: 'center',
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
  },
  viewToggleOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  timelineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  timelineHint: {
    fontSize: 11,
  },
  jumpLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  timelineWrap: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hourLabels: {
    width: 48,
  },
  hourLabelCell: {
    height: HOUR_HEIGHT,
    alignItems: 'flex-end',
    paddingEnd: spacing.xs,
  },
  hourLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timelineTrack: {
    flex: 1,
    position: 'relative',
    borderStartWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  timelineBlock: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  timelineBlockText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
  },
  clockWrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  clockCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  clockTotal: {
    fontSize: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  clockLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  clockHint: {
    fontSize: 11,
    textAlign: 'center',
  },
});
