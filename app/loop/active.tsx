import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { LoopControls } from '../../src/components/timer/LoopControls';
import { TimerDisplay } from '../../src/components/timer/TimerDisplay';
import { TimerProgress } from '../../src/components/timer/TimerProgress';
import { formatDayLabel } from '../../src/domain/shared/dateUtils';
import { loopService } from '../../src/features/loops/loopService';
import { useActiveLoop } from '../../src/hooks/useActiveLoop';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function ActiveLoopScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { activeLoop, elapsedSeconds, loading, refresh } = useActiveLoop();
  const [busy, setBusy] = useState(false);

  const handleStop = async () => {
    if (!activeLoop) return;
    if (activeLoop.status === 'ACTIVE') {
      setBusy(true);
      try {
        await loopService.pauseLoop(db, activeLoop.id);
        await refresh(db);
      } catch (error) {
        Alert.alert(
          'Could not stop the loop',
          error instanceof Error ? error.message : 'Please try again.'
        );
        return;
      } finally {
        setBusy(false);
      }
    }
    router.push({
      pathname: '/loop/complete',
      params: { loopId: activeLoop.id },
    });
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await refresh(db);
    } catch (error) {
      Alert.alert(
        'Loop update failed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Recovering your loop…" />;
  }

  if (!activeLoop) {
    return (
      <Screen>
        <EmptyState
          title="No loop is running"
          message="Start a loop when you are ready to focus."
          action={
            <Button
              label="Start a loop"
              onPress={() => router.replace('/loop/start')}
            />
          }
        />
      </Screen>
    );
  }

  const isPaused = activeLoop.status === 'PAUSED';
  const reachedTarget = elapsedSeconds >= activeLoop.target_duration_seconds;

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={styles.identifierBlock}>
          <Text style={[styles.identifier, { color: colors.accent }]}>
            H{activeLoop.sequence_number}
          </Text>
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            {formatDayLabel(activeLoop.local_date)}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: isPaused ? colors.surfaceAlt : colors.accentSoft,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: isPaused ? colors.textSecondary : colors.accent },
            ]}
          >
            {isPaused ? 'PAUSED' : reachedTarget ? 'TARGET REACHED' : 'FOCUSING'}
          </Text>
        </View>
      </View>

      <TimerDisplay
        elapsedSeconds={elapsedSeconds}
        targetSeconds={activeLoop.target_duration_seconds}
        paused={isPaused}
      />

      <TimerProgress
        elapsedSeconds={elapsedSeconds}
        targetSeconds={activeLoop.target_duration_seconds}
      />

      {activeLoop.focus ? (
        <View
          style={[
            styles.focusCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.focusLabel, { color: colors.textSecondary }]}>
            FOCUS
          </Text>
          <Text style={[styles.focusText, { color: colors.text }]}>
            {activeLoop.focus}
          </Text>
        </View>
      ) : null}

      {activeLoop.carry_in ? (
        <View style={styles.carryBlock}>
          <Text style={[styles.carryLabel, { color: colors.textSecondary }]}>
            CARRY IN
          </Text>
          <Text style={[styles.carryText, { color: colors.textSecondary }]}>
            {activeLoop.carry_in}
          </Text>
        </View>
      ) : null}

      <LoopControls
        status={isPaused ? 'PAUSED' : 'ACTIVE'}
        busy={busy}
        onPause={() => {
          void runAction(() => loopService.pauseLoop(db, activeLoop.id));
        }}
        onResume={() => {
          void runAction(() => loopService.resumeLoop(db, activeLoop.id));
        }}
        onStop={() => {
          void handleStop();
        }}
        onMinimize={() => {
          router.replace('/(tabs)');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  identifierBlock: {
    gap: spacing.xs,
    flex: 1,
  },
  identifier: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  date: {
    fontSize: 13,
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  focusCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  focusLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  focusText: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  carryBlock: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  carryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  carryText: {
    fontSize: 14,
    lineHeight: 21,
  },
});
