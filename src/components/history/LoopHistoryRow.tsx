import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortDayLabel, formatTimeOfDay } from '../../domain/shared/dateUtils';
import { formatDurationCompact } from '../../domain/timer/timerEngine';
import type { Loop } from '../../domain/types';
import { useTranslation } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/types';
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
  const { t } = useTranslation();
  const title = loop.done?.trim() || loop.focus?.trim() || t('loopRow.untitled');
  const timeLabel = loop.stopped_at
    ? formatTimeOfDay(loop.stopped_at)
    : loop.status === 'PAUSED'
      ? t('loopRow.paused')
      : t('loopRow.running');
  const statusLabelKey: TranslationKey | null =
    loop.status === 'ACTIVE'
      ? 'loopRow.statusActive'
      : loop.status === 'PAUSED'
        ? 'loopRow.statusPaused'
        : loop.status === 'COMPLETED'
          ? 'loopRow.statusCompleted'
          : null;

  const content = (
    <>
      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
          style={[styles.badgeText, { color: colors.accent }]}
        >
          {Number.isFinite(loop.sequence_number)
            ? `H${loop.sequence_number}`
            : 'H?'}
        </Text>
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {showDate ? `${formatShortDayLabel(loop.local_date)} · ` : ''}
          {timeLabel}
          {loop.status === 'COMPLETED' || !statusLabelKey
            ? ''
            : ` · ${t(statusLabelKey)}`}
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
    alignItems: 'center',
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
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
