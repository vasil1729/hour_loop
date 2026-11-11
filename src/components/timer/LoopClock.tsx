import React from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

import type { Loop } from '../../domain/types';
import {
  formatDurationCompact,
  formatElapsed,
  progressRatio,
  remainingSeconds,
} from '../../domain/timer/timerEngine';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/tokens';

const TICK_COUNT = 60;

type LoopClockProps = {
  loop: Loop;
  elapsedSeconds: number;
  targetSeconds: number;
};

export function LoopClock({
  loop,
  elapsedSeconds,
  targetSeconds,
}: LoopClockProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(Math.max(width - 88, 220), 320);
  const center = size / 2;
  const ratio = progressRatio(targetSeconds, elapsedSeconds);
  const remaining = remainingSeconds(targetSeconds, elapsedSeconds);
  const reached = remaining === 0;
  const isPaused = loop.status === 'PAUSED';
  const progressColor = reached ? colors.success : colors.accent;

  const outerRadius = center - 4;
  const ringRadius = outerRadius - 24;
  const strokeWidth = Math.max(7, Math.round(size * 0.028));
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference * (1 - ratio);
  const knobAngle = ratio * 2 * Math.PI - Math.PI / 2;
  const knobX = center + ringRadius * Math.cos(knobAngle);
  const knobY = center + ringRadius * Math.sin(knobAngle);
  const litTicks = ratio > 0 ? Math.max(1, Math.round(ratio * TICK_COUNT)) : 0;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      accessibilityLabel={`Loop progress. ${formatElapsed(
        elapsedSeconds
      )} focused toward a ${formatElapsed(targetSeconds)} target.`}
      style={styles.wrapper}
    >
      <View style={[styles.face, { width: size, height: size }]}>
        <Svg
          pointerEvents="none"
          width={size}
          height={size}
          style={StyleSheet.absoluteFillObject}
        >
          {Array.from({ length: TICK_COUNT }, (_, index) => {
            const hourTick = index % 5 === 0;
            const radians = ((index * 360) / TICK_COUNT - 90) * (Math.PI / 180);
            const innerRadius = outerRadius - (hourTick ? 12 : 7);
            const lit = index < litTicks;

            return (
              <Line
                key={index}
                x1={center + innerRadius * Math.cos(radians)}
                y1={center + innerRadius * Math.sin(radians)}
                x2={center + outerRadius * Math.cos(radians)}
                y2={center + outerRadius * Math.sin(radians)}
                stroke={lit ? progressColor : colors.border}
                strokeWidth={hourTick ? 3 : 1.5}
                strokeLinecap="round"
                opacity={lit ? 1 : 0.65}
              />
            );
          })}

          <Circle
            cx={center}
            cy={center}
            r={ringRadius}
            stroke={colors.surfaceAlt}
            strokeWidth={strokeWidth}
            fill="none"
          />

          {ratio > 0 ? (
            <G opacity={isPaused ? 0.55 : 1}>
              <Circle
                cx={center}
                cy={center}
                r={ringRadius}
                stroke={progressColor}
                strokeWidth={strokeWidth * 1.9}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={[circumference, circumference]}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${center} ${center})`}
                opacity={0.14}
              />
              <Circle
                cx={center}
                cy={center}
                r={ringRadius}
                stroke={progressColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={[circumference, circumference]}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${center} ${center})`}
              />
              <Circle
                cx={knobX}
                cy={knobY}
                r={strokeWidth * 0.9}
                fill={progressColor}
                stroke={colors.background}
                strokeWidth={Math.max(2, strokeWidth * 0.3)}
              />
            </G>
          ) : null}
        </Svg>

        <View style={styles.center}>
          <Text
            style={[
              styles.elapsed,
              {
                color: colors.text,
                fontSize: Math.max(30, Math.round(size * 0.12)),
                opacity: isPaused ? 0.55 : 1,
              },
            ]}
          >
            {formatElapsed(elapsedSeconds)}
          </Text>
          <Text style={[styles.target, { color: colors.textSecondary }]}>
            target {formatElapsed(targetSeconds)}
          </Text>
          <Text
            style={[
              styles.remaining,
              { color: reached ? colors.success : colors.textSecondary },
            ]}
          >
            {reached
              ? 'Target reached'
              : `${formatDurationCompact(remaining)} remaining`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  elapsed: {
    fontWeight: '300',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  target: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  remaining: {
    fontSize: 13,
    fontWeight: '600',
  },
});
