import React, {
  useCallback,
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
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import {
  addDaysToDayKey,
  currentDayKey,
  formatDayLabel,
  getDeviceTimeZone,
  getZonedParts,
} from '../../src/domain/shared/dateUtils';
import { formatDurationCompact } from '../../src/domain/timer/timerEngine';
import {
  getDayCapsuleData,
  type DayCapsuleData,
} from '../../src/features/days/dayCapsuleService';
import { capsuleColor } from '../../src/theme/capsuleColors';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

const HOUR_HEIGHT = 58;
const HOURS = Array.from({ length: 24 }, (_, hour) => {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
});

type ViewMode = 'timeline' | 'clock';

function minutesOfDay(iso: string, timeZone: string): number {
  const parts = getZonedParts(new Date(iso), timeZone);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

export default function DayViewScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = currentDayKey();
  const [selectedDay, setSelectedDay] = useState(
    typeof params.date === 'string' ? params.date : today
  );
  const [data, setData] = useState<DayCapsuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const scrollRef = useRef<ScrollView>(null);
  const [timelineTop, setTimelineTop] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void getDayCapsuleData(db, selectedDay)
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
    }, [db, selectedDay])
  );

  const colorByItem = useMemo(() => {
    const map = new Map<string, string>();
    data?.capsules.forEach((capsule, index) => {
      map.set(capsule.itemId, capsuleColor(index));
    });
    return map;
  }, [data]);

  const isToday = selectedDay >= today;
  const timeZone = getDeviceTimeZone();

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
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.topBarTitle}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
              DAY VIEW
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {formatDayLabel(selectedDay)}
            </Text>
          </View>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.dayNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => setSelectedDay((day) => addDaysToDayKey(day, -1))}
            hitSlop={10}
            style={[styles.navButton, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            disabled={isToday}
            onPress={() => setSelectedDay((day) => addDaysToDayKey(day, 1))}
            hitSlop={10}
            style={[
              styles.navButton,
              { backgroundColor: colors.surface, opacity: isToday ? 0.35 : 1 },
            ]}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
          {!isToday ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
              onPress={() => setSelectedDay(today)}
            >
              <Text style={[styles.todayLink, { color: colors.accent }]}>
                Today
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.todayLabel, { color: colors.textSecondary }]}>
              Today
            </Text>
          )}
          <View style={styles.navSpacer} />
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
            {formatDurationCompact(data?.totalSeconds ?? 0)} focused
          </Text>
        </View>

        {loading && !data ? (
          <LoadingScreen />
        ) : !data || data.capsules.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title="No capsule time yet"
              message="Focus capsules during a loop and their time will appear here."
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
              <View style={styles.summaryHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Capsules
                </Text>
                <Text
                  style={[styles.summaryTotal, { color: colors.textSecondary }]}
                >
                  {data.capsules.length} ·{' '}
                  {formatDurationCompact(data.totalSeconds)}
                </Text>
              </View>
              {data.capsules.map((capsule) => (
                <View key={capsule.itemId} style={styles.capsuleRow}>
                  <View
                    style={[
                      styles.colorDot,
                      {
                        backgroundColor:
                          colorByItem.get(capsule.itemId) ?? colors.accent,
                      },
                    ]}
                  />
                  <View style={styles.capsuleBody}>
                    <Text
                      numberOfLines={1}
                      style={[styles.capsuleText, { color: colors.text }]}
                    >
                      {capsule.text}
                    </Text>
                    <Text
                      style={[
                        styles.capsuleMeta,
                        { color: colors.textSecondary },
                      ]}
                    >
                      H{capsule.loopSequence}
                    </Text>
                  </View>
                  <Text
                    style={[styles.capsuleDuration, { color: colors.text }]}
                  >
                    {formatDurationCompact(capsule.seconds)}
                  </Text>
                </View>
              ))}
            </View>

            <View
              style={[
                styles.viewToggle,
                { backgroundColor: colors.surfaceAlt },
              ]}
            >
              {(
                [
                  ['timeline', 'Timeline'],
                  ['clock', 'Clock'],
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

            {viewMode === 'timeline' ? (
              <>
                <View style={styles.timelineActions}>
                  <Text
                    style={[styles.timelineHint, { color: colors.textSecondary }]}
                  >
                    Scroll through the day
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isToday ? 'Jump to current time' : 'Jump to first capsule'
                    }
                    onPress={jumpToTimeline}
                    hitSlop={8}
                  >
                    <Text style={[styles.jumpLink, { color: colors.accent }]}>
                      {isToday ? 'Jump to now' : 'Jump to first capsule'}
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
                  />
                </View>
              </>
            ) : (
              <ClockView
                data={data}
                colorByItem={colorByItem}
                timeZone={timeZone}
                width={width}
              />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function TimelineView({
  data,
  colorByItem,
  timeZone,
  isToday,
}: {
  data: DayCapsuleData;
  colorByItem: Map<string, string>;
  timeZone: string;
  isToday: boolean;
}) {
  const { colors } = useTheme();
  const now = new Date();
  const nowMinutes =
    isToday ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 : -1;

  return (
    <View style={styles.timelineWrap}>
      <View style={styles.hourLabels}>
        {HOURS.map((label) => (
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
        {HOURS.map((label, hour) => (
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
          return (
            <View
              key={`${segment.itemId}-${segment.startAt}-${index}`}
              style={[
                styles.timelineBlock,
                {
                  top: (startMinutes / 60) * HOUR_HEIGHT,
                  height,
                  backgroundColor: color,
                },
              ]}
            >
              {showText ? (
                <Text numberOfLines={2} style={styles.timelineBlockText}>
                  {capsule?.text ?? 'Capsule'}
                  {height >= 44
                    ? ` · ${formatDurationCompact(segment.seconds)}`
                    : ''}
                </Text>
              ) : null}
            </View>
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
}: {
  data: DayCapsuleData;
  colorByItem: Map<string, string>;
  timeZone: string;
  width: number;
}) {
  const { colors } = useTheme();
  const size = Math.min(Math.max(width - 72, 240), 360);
  const center = size / 2;
  const radius = center - 24;
  const point = (minutes: number, r: number = radius) => {
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
            r={radius}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
          {Array.from({ length: 96 }, (_, index) => {
            const minutes = index * 15;
            const hourTick = index % 4 === 0;
            const outer = point(minutes, radius);
            const inner = point(minutes, radius - (hourTick ? 12 : 6));
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
          {data.segments.map((segment, index) => {
            const start = minutesOfDay(segment.startAt, timeZone);
            const end = minutesOfDay(segment.endAt, timeZone);
            const arcMinutes = Math.min(
              Math.max(10, end - start),
              Math.max(1, 1440 - start)
            );
            const startPoint = point(start, radius);
            const endPoint = point(start + arcMinutes, radius);
            const largeArc = arcMinutes > 720 ? 1 : 0;
            const color = colorByItem.get(segment.itemId) ?? colors.accent;
            return (
              <Path
                key={`${segment.itemId}-${segment.startAt}-${index}`}
                d={`M ${center} ${center} L ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y} Z`}
                fill={color}
                fillOpacity={0.82}
                stroke={color}
                strokeWidth={1}
              />
            );
          })}
        </Svg>
        <View pointerEvents="none" style={styles.clockCenter}>
          <Text style={[styles.clockTotal, { color: colors.text }]}>
            {formatDurationCompact(data.totalSeconds)}
          </Text>
          <Text style={[styles.clockLabel, { color: colors.textSecondary }]}>
            FOCUSED
          </Text>
        </View>
      </View>
      <Text style={[styles.clockHint, { color: colors.textSecondary }]}>
        Each wedge is one capsule across the 24-hour day.
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
  summaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryTotal: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  capsuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
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
    paddingRight: spacing.xs,
  },
  hourLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timelineTrack: {
    flex: 1,
    position: 'relative',
    borderLeftWidth: StyleSheet.hairlineWidth,
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
