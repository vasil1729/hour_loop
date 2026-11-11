import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatShortDayLabel,
  formatTimeOfDay,
  getDeviceTimeZone,
  toLocalDateKey,
} from '../../domain/shared/dateUtils';
import type {
  LoopEvent,
  LoopEventKind,
} from '../../features/loops/loopTimeline';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

const EVENT_LABELS: Record<LoopEventKind, string> = {
  STARTED: 'Started',
  PAUSED: 'Paused',
  RESUMED: 'Resumed',
  STOPPED: 'Stopped',
};

type LoopTimelineProps = {
  events: LoopEvent[];
};

export function LoopTimeline({ events }: LoopTimelineProps) {
  const { colors } = useTheme();
  if (events.length === 0) return null;

  const timeZone = getDeviceTimeZone();

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
        {events.map((event, index) => {
          const dayKey = toLocalDateKey(new Date(event.at), timeZone);
          const previousEvent = index > 0 ? events[index - 1] : undefined;
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
              ? colors.warning
              : event.kind === 'STOPPED'
                ? colors.danger
                : colors.accent;

          return (
            <View
              key={`${event.kind}-${event.at}-${index}`}
              accessible
              accessibilityLabel={`${EVENT_LABELS[event.kind]} at ${timeLabel}`}
              style={styles.row}
            >
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              <Text style={[styles.eventLabel, { color: colors.text }]}>
                {EVENT_LABELS[event.kind]}
              </Text>
              <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                {timeLabel}
              </Text>
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
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  eventLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  eventTime: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
