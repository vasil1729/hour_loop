import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatIntentionDuration } from '../../domain/intentions/intentionsDomain';
import { formatDurationCompact } from '../../domain/timer/timerEngine';
import type { IntentionSummary } from '../../features/intentions/intentionsService';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type DaySummaryProps = {
  totalSeconds: number;
  loopCount: number;
  daily: IntentionSummary;
};

export function DaySummary({ totalSeconds, loopCount, daily }: DaySummaryProps) {
  const { colors } = useTheme();
  const hasIntention = daily.targetSeconds > 0;
  const percent = daily.progress.percent;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatDurationCompact(totalSeconds)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            FOCUSED
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{loopCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            {loopCount === 1 ? 'LOOP' : 'LOOPS'}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text
            style={[
              styles.statValue,
              { color: daily.progress.reached ? colors.success : colors.accent },
            ]}
          >
            {hasIntention ? `${percent}%` : '—'}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            OF INTENTION
          </Text>
        </View>
      </View>

      {hasIntention ? (
        <>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${percent}%`,
                  backgroundColor: daily.progress.reached
                    ? colors.success
                    : colors.accent,
                },
              ]}
            />
          </View>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {daily.isDefault ? 'Default target · ' : ''}
            {formatIntentionDuration(daily.actualSeconds)} of{' '}
            {formatIntentionDuration(daily.targetSeconds)} intended
          </Text>
        </>
      ) : (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          No daily intention was set for this day.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
  meta: {
    fontSize: 12,
  },
});
