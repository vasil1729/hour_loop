import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatDurationCompact,
  progressRatio,
  remainingSeconds,
} from '../../domain/timer/timerEngine';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type TimerProgressProps = {
  elapsedSeconds: number;
  targetSeconds: number;
  reachedLabel?: string;
};

export function TimerProgress({
  elapsedSeconds,
  targetSeconds,
  reachedLabel = 'Target reached',
}: TimerProgressProps) {
  const { colors } = useTheme();
  const ratio = progressRatio(targetSeconds, elapsedSeconds);
  const remaining = remainingSeconds(targetSeconds, elapsedSeconds);
  const reached = remaining === 0;

  return (
    <View style={styles.container}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
        style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(ratio * 100)}%`,
              backgroundColor: reached ? colors.success : colors.accent,
            },
          ]}
        />
      </View>
      <Text
        style={[
          styles.label,
          { color: reached ? colors.success : colors.textSecondary },
        ]}
      >
        {reached ? reachedLabel : `${formatDurationCompact(remaining)} remaining`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  track: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
