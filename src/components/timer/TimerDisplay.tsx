import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatElapsed } from '../../domain/timer/timerEngine';
import { useTranslation } from '../../i18n/I18nProvider';
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
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text
        accessibilityLabel={t('timerDisplay.elapsedA11y', {
          hours: Math.floor(elapsedSeconds / 3600),
          minutes: Math.floor((elapsedSeconds % 3600) / 60),
          seconds: elapsedSeconds % 60,
        })}
        style={[
          styles.timer,
          { color: colors.text, opacity: paused ? 0.55 : 1 },
        ]}
      >
        {formatElapsed(elapsedSeconds)}
      </Text>
      <Text style={[styles.target, { color: colors.textSecondary }]}>
        {t('timerDisplay.target', { time: formatElapsed(targetSeconds) })}
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
