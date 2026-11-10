import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatElapsed } from '../../domain/timer/timerEngine';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, spacing } from '../../theme/tokens';

type TimerDisplayProps = {
  elapsedSeconds: number;
  targetSeconds: number;
  paused?: boolean;
};

export function TimerDisplay({
  elapsedSeconds,
  targetSeconds,
  paused = false,
}: TimerDisplayProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text
        accessibilityLabel={`${Math.floor(elapsedSeconds / 3600)} hours, ${Math.floor(
          (elapsedSeconds % 3600) / 60
        )} minutes, ${elapsedSeconds % 60} seconds elapsed`}
        style={[
          styles.timer,
          { color: colors.text, opacity: paused ? 0.55 : 1 },
        ]}
      >
        {formatElapsed(elapsedSeconds)}
      </Text>
      <Text style={[styles.target, { color: colors.textSecondary }]}>
        target {formatElapsed(targetSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  timer: {
    fontSize: fontSize.timer,
    fontWeight: '300',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  target: {
    fontSize: fontSize.sm,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
