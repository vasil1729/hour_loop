import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortDayLabel, formatTimeOfDay } from '../../domain/shared/dateUtils';
import { formatDurationCompact } from '../../domain/timer/timerEngine';
import type { Loop } from '../../domain/types';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type LoopHistoryRowProps = {
  loop: Loop;
  elapsedSeconds: number;
  showDate?: boolean;
  onPress?: () => void;
};

export function LoopHistoryRow({
  loop,
  elapsedSeconds,
  showDate = false,
  onPress,
}: LoopHistoryRowProps) {
  const { colors } = useTheme();
  const title = loop.done?.trim() || loop.focus?.trim() || 'Untitled loop';
  const timeLabel = loop.stopped_at
    ? formatTimeOfDay(loop.stopped_at)
    : loop.status === 'PAUSED'
      ? 'Paused'
      : 'Running';

  const content = (
    <>
      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.badgeText, { color: colors.accent }]}>
          H{loop.sequence_number}
        </Text>
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {showDate ? `${formatShortDayLabel(loop.local_date)} · ` : ''}
          {timeLabel}
          {loop.status === 'COMPLETED' ? '' : ` · ${loop.status.toLowerCase()}`}
        </Text>
      </View>
      <Text style={[styles.duration, { color: colors.textSecondary }]}>
        {formatDurationCompact(elapsedSeconds)}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface }]}>{content}</View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open loop H${loop.sequence_number}: ${title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  badge: {
    minWidth: 42,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
  },
  duration: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
