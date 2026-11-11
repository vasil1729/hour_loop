import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatIntentionDuration } from '../../domain/intentions/intentionsDomain';
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
  const hasTarget = summary.targetSeconds > 0;

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
          {hasTarget ? 'Edit' : 'Set'}
        </Text>
      </View>

      {hasTarget ? (
        <>
          <View style={styles.valueRow}>
            <Text style={[styles.actual, { color: colors.text }]}>
              {formatIntentionDuration(summary.actualSeconds)}
            </Text>
            <Text style={[styles.target, { color: colors.textSecondary }]}>
              / {formatIntentionDuration(summary.targetSeconds)}
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
            {summary.isDefault ? 'Default target · ' : ''}
            {summary.progress.reached
              ? 'Intention reached'
              : `${formatIntentionDuration(summary.progress.remainingSeconds)} to go`}
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
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  label: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  action: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  actual: {
    flexShrink: 0,
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  target: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '500',
  },
  percent: {
    flexShrink: 0,
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
