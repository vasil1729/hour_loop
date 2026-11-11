import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

export type PeriodSummaryStat = {
  label: string;
  value: string;
  tone?: 'text' | 'accent' | 'success';
};

type PeriodSummaryProps = {
  stats: PeriodSummaryStat[];
  progress?: {
    percent: number;
    reached: boolean;
    label: string;
  };
  meta: string;
};

export function PeriodSummary({ stats, progress, meta }: PeriodSummaryProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.stats}>
        {stats.map((stat, index) => (
          <React.Fragment key={stat.label}>
            {index > 0 ? (
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            ) : null}
            <View style={styles.stat}>
              <Text
                style={[
                  styles.statValue,
                  {
                    color:
                      stat.tone === 'accent'
                        ? colors.accent
                        : stat.tone === 'success'
                          ? colors.success
                          : colors.text,
                  },
                ]}
              >
                {stat.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                {stat.label}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {progress ? (
        <>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(100, Math.max(0, progress.percent))}%`,
                  backgroundColor: progress.reached
                    ? colors.success
                    : colors.accent,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
            {progress.label}
          </Text>
        </>
      ) : null}

      <Text style={[styles.meta, { color: colors.textSecondary }]}>{meta}</Text>
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
  progressLabel: {
    fontSize: 12,
  },
  meta: {
    fontSize: 12,
  },
});
