import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatShortDayLabel,
  formatTimeOfDay,
  getDeviceTimeZone,
  toLocalDateKey,
} from '../../domain/shared/dateUtils';
import { formatDurationWithSeconds } from '../../domain/timer/timerEngine';
import type {
  LoopEvent,
  LoopEventKind,
} from '../../features/loops/loopTimeline';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

const EVENT_LABELS: Record<LoopEventKind | 'NOW', string> = {
  STARTED: 'Started',
  PAUSED: 'Paused',
  RESUMED: 'Resumed',
  STOPPED: 'Stopped',
  NOW: 'Now',
};

type TimelineEvent = LoopEvent | { kind: 'NOW'; at: string };

type LoopTimelineProps = {
  events: LoopEvent[];
  referenceTime?: Date;
};

export function LoopTimeline({ events, referenceTime }: LoopTimelineProps) {
  const { colors } = useTheme();
  if (events.length === 0) return null;

  const timeZone = getDeviceTimeZone();
  const last = events[events.length - 1];
  const showNow =
    referenceTime !== undefined &&
    (last?.kind === 'STARTED' || last?.kind === 'RESUMED');
  const allEvents: TimelineEvent[] = showNow
    ? [...events, { kind: 'NOW', at: referenceTime.toISOString() }]
    : events;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>
        SESSION LOG
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {allEvents.map((event, index) => {
          const nextEvent = allEvents[index + 1];
          const dayKey = toLocalDateKey(new Date(event.at), timeZone);
          const previousEvent = index > 0 ? allEvents[index - 1] : undefined;
          const previousDayKey = previousEvent
            ? toLocalDateKey(new Date(previousEvent.at), timeZone)
            : null;
          const time = formatTimeOfDay(event.at, timeZone);
          const timeLabel =
            dayKey === previousDayKey
              ? time
              : `${formatShortDayLabel(dayKey)} · ${time}`;
          const dotColor =
            event.kind === 'PAUSED'
              ? colors.danger
              : event.kind === 'STOPPED'
                ? colors.danger
                : event.kind === 'RESUMED'
                  ? colors.success
                  : colors.accent;

          const segmentSeconds = nextEvent
            ? Math.max(0, (Date.parse(nextEvent.at) - Date.parse(event.at)) / 1000)
            : null;
          const segmentState =
            event.kind === 'PAUSED'
              ? 'paused'
              : event.kind === 'STARTED' || event.kind === 'RESUMED'
                ? 'running'
                : null;
          const lineColor =
            segmentState === 'running'
              ? colors.success
              : segmentState === 'paused'
                ? colors.danger
                : null;
          const segmentHeight =
            segmentSeconds === null
              ? undefined
              : Math.max(20, Math.min(96, 12 + (segmentSeconds / 60) * 6));
          const durationLabel =
            segmentSeconds !== null && segmentSeconds > 0 && segmentState
              ? `${formatDurationWithSeconds(segmentSeconds)} ${
                  segmentState === 'paused' ? 'paused' : 'focused'
                }`
              : null;

          return (
            <View
              key={`${event.kind}-${event.at}-${index}`}
              accessible
              accessibilityLabel={`${EVENT_LABELS[event.kind]} at ${timeLabel}${
                durationLabel ? `, ${durationLabel}` : ''
              }`}
              style={[
                styles.row,
                segmentHeight !== undefined ? { minHeight: segmentHeight } : null,
              ]}
            >
              <View style={styles.rail}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: dotColor,
                      borderColor: colors.surface,
                    },
                  ]}
                />
                {lineColor ? (
                  <View style={[styles.line, { backgroundColor: lineColor }]} />
                ) : null}
              </View>
              <View
                style={[
                  styles.content,
                  index === allEvents.length - 1 ? styles.contentLast : null,
                ]}
              >
                <View style={styles.headerRow}>
                  <Text style={[styles.eventLabel, { color: colors.text }]}>
                    {EVENT_LABELS[event.kind]}
                  </Text>
                  <Text
                    style={[styles.eventTime, { color: colors.textSecondary }]}
                  >
                    {timeLabel}
                  </Text>
                </View>
                {durationLabel ? (
                  <Text
                    style={[
                      styles.duration,
                      { color: lineColor ?? colors.textSecondary },
                    ]}
                  >
                    {durationLabel}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rail: {
    width: 10,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    borderWidth: 2,
    marginTop: spacing.sm,
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 2,
    borderRadius: radius.full,
  },
  content: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  contentLast: {
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eventLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  eventTime: {
    flexShrink: 0,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  duration: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
