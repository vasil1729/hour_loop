import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDurationCompact } from '../../domain/timer/timerEngine';
import type { IntentionSummary } from '../../features/intentions/intentionsService';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type IntentionBarProps = {
  label: string;
  summary: IntentionSummary;
  onPress: () => void;
};

export function IntentionBar({ label, summary, onPress }: IntentionBarProps) {
  const { colors } = useTheme();
  const hasIntention = Boolean(summary.intention);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} intention`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.action, { color: colors.accent }]}>
          {hasIntention ? 'Edit' : 'Set'}
        </Text>
      </View>

      {hasIntention ? (
        <>
          <View style={styles.valueRow}>
            <Text style={[styles.actual, { color: colors.text }]}>
              {formatDurationCompact(summary.actualSeconds)}
            </Text>
            <Text style={[styles.target, { color: colors.textSecondary }]}>
              / {formatDurationCompact(summary.intention?.target_duration_seconds ?? 0)}
            </Text>
            <Text
              style={[
                styles.percent,
                { color: summary.progress.reached ? colors.success : colors.accent },
              ]}
            >
              {summary.progress.percent}%
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${summary.progress.percent}%`,
                  backgroundColor: summary.progress.reached
                    ? colors.success
                    : colors.accent,
                },
              ]}
            />
          </View>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {summary.progress.reached
              ? 'Intention reached'
              : `${formatDurationCompact(summary.progress.remainingSeconds)} to go`}
          </Text>
        </>
      ) : (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Set a target for this {label.toLowerCase()}.
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  action: {
    fontSize: 11,
    fontWeight: '700',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  actual: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  target: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  percent: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 5,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
  meta: {
    fontSize: 11,
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
