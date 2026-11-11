import React from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { Loop, LoopInterval } from '../../domain/types';
import {
  formatDurationCompact,
  formatElapsed,
  remainingSeconds,
} from '../../domain/timer/timerEngine';
import { buildLoopClock } from '../../features/loops/loopClock';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type LoopClockProps = {
  loop: Loop;
  intervals: LoopInterval[];
  elapsedSeconds: number;
  targetSeconds: number;
  referenceTime?: Date;
};

export function LoopClock({
  loop,
  intervals,
  elapsedSeconds,
  targetSeconds,
  referenceTime = new Date(),
}: LoopClockProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(Math.max(width - 88, 220), 320);
  const model = buildLoopClock(loop, intervals, referenceTime);
  const remaining = remainingSeconds(targetSeconds, elapsedSeconds);
  const reached = remaining === 0;
  const hasPaused = model.ticks.includes('paused');

  return (
    <View
      accessible
      accessibilityLabel={`Loop clock. ${formatElapsed(
        elapsedSeconds
      )} focused, target ${formatElapsed(targetSeconds)}.`}
      style={styles.wrapper}
    >
      <View style={[styles.face, { width: size, height: size }]}>
        {model.ticks.map((state, index) => {
          const hourTick = index % 5 === 0;
          const color =
            state === 'running'
              ? colors.success
              : state === 'paused'
                ? colors.danger
                : colors.border;
          return (
            <View
              key={index}
              pointerEvents="none"
              style={[
                styles.tickWrapper,
                {
                  width: size,
                  height: size,
                  transform: [{ rotate: `${index * 6}deg` }],
                },
              ]}
            >
              <View
                style={[
                  styles.tick,
                  {
                    height: hourTick ? 18 : state === 'idle' ? 9 : 14,
                    width: hourTick ? 3 : state === 'idle' ? 1.5 : 2.5,
                    marginTop: hourTick ? 8 : state === 'idle' ? 13 : 10,
                    backgroundColor: color,
                    opacity: state === 'idle' ? 0.8 : 1,
                  },
                ]}
              />
            </View>
          );
        })}

        <ClockMarker angle={model.startAngle} color={colors.accent} size={size} />
        <ClockMarker
          angle={model.endAngle}
          color={model.isLive ? colors.success : colors.accent}
          size={size}
        />

        <View style={styles.center}>
          <Text
            style={[
              styles.elapsed,
              {
                color: colors.text,
                opacity: loop.status === 'PAUSED' ? 0.55 : 1,
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

      {hasPaused ? (
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Focus
          </Text>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Paused
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ClockMarker({
  angle,
  color,
  size,
}: {
  angle: number;
  color: string;
  size: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.markerWrapper,
        {
          width: size,
          height: size,
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
    >
      <View style={[styles.marker, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  tick: {
    borderRadius: radius.full,
  },
  markerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  marker: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
  },
  center: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  elapsed: {
    fontSize: 38,
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
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    marginLeft: spacing.sm,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
