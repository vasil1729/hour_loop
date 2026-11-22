import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortDayLabel, formatTimeOfDay } from '../../domain/shared/dateUtils';
import { formatDurationCompact } from '../../domain/timer/timerEngine';
import type { Loop, LoopItem } from '../../domain/types';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type LoopHistoryRowProps = {
  loop: Loop;
  elapsedSeconds: number;
  capsules?: LoopItem[];
  showDate?: boolean;
  onPress?: () => void;
};

export function LoopHistoryRow({
  loop,
  elapsedSeconds,
  capsules = [],
  showDate = false,
  onPress,
}: LoopHistoryRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const title = t('loopRow.hourLabel', { count: loop.sequence_number });
  const started = formatTimeOfDay(loop.started_at);
  const stopped = loop.stopped_at ? formatTimeOfDay(loop.stopped_at) : null;
  const timeLabel = stopped
    ? `${started}–${stopped}`
    : `${started} · ${
        loop.status === 'PAUSED'
          ? t('loopRow.paused')
          : t('loopRow.running')
      }`;
  const visibleCapsules = capsules.slice(0, 3);
  const hiddenCapsuleCount = Math.max(0, capsules.length - visibleCapsules.length);

  const content = (
    <>
      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
          style={[styles.badgeText, { color: colors.accent }]}
        >
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
        </Text>
        {visibleCapsules.length > 0 ? (
          <View style={styles.capsuleRow}>
            {visibleCapsules.map((capsule) => (
              <View
                key={capsule.id}
                style={[
                  styles.capsule,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.capsuleText,
                    { color: colors.textSecondary },
                    capsule.done ? styles.capsuleDone : null,
                  ]}
                >
                  {capsule.text}
                </Text>
              </View>
            ))}
            {hiddenCapsuleCount > 0 ? (
              <Text style={[styles.moreCapsules, { color: colors.textSecondary }]}>
                +{hiddenCapsuleCount}
              </Text>
            ) : null}
          </View>
        ) : null}
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
      accessibilityLabel={t('loopRow.openA11y', {
        sequence: loop.sequence_number,
        title,
      })}
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
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  badge: {
    minWidth: 48,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeText: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
  },
  capsuleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  capsule: {
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  capsuleText: {
    fontSize: 11,
    fontWeight: '500',
  },
  capsuleDone: {
    textDecorationLine: 'line-through',
  },
  moreCapsules: {
    fontSize: 11,
    fontWeight: '600',
  },
  duration: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
});
