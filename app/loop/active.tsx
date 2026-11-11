import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { ConfirmDialog } from '../../src/components/common/ConfirmDialog';
import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { LoopItemCapsule } from '../../src/components/loops/LoopItemCapsule';
import { LoopControls } from '../../src/components/timer/LoopControls';
import { LoopTimeline } from '../../src/components/timer/LoopTimeline';
import { TimerDisplay } from '../../src/components/timer/TimerDisplay';
import { TimerProgress } from '../../src/components/timer/TimerProgress';
import { formatDayLabel } from '../../src/domain/shared/dateUtils';
import { formatElapsed } from '../../src/domain/timer/timerEngine';
import type { LoopItem } from '../../src/domain/types';
import { loopService } from '../../src/features/loops/loopService';
import { buildLoopTimeline } from '../../src/features/loops/loopTimeline';
import { goToToday } from '../../src/services/navigation/navigationService';
import {
  cancelLoopNotification,
  syncLoopNotification,
} from '../../src/services/notifications/notificationService';
import { useActiveLoop } from '../../src/hooks/useActiveLoop';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function ActiveLoopScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { activeLoop, elapsedSeconds, loading, refresh, intervals } = useActiveLoop();
  const [busy, setBusy] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [items, setItems] = useState<LoopItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      const loopId = activeLoop?.id;
      if (!loopId) {
        setItems([]);
        return;
      }
      let cancelled = false;
      void loopService
        .getLoopItems(db, loopId)
        .then((result) => {
          if (!cancelled) setItems(result);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
      return () => {
        cancelled = true;
      };
    }, [db, activeLoop?.id])
  );

  const toggleItem = async (item: LoopItem) => {
    if (!activeLoop) return;
    const nextDone = !item.done;
    setItems((previous) =>
      previous.map((entry) =>
        entry.id === item.id ? { ...entry, done: nextDone } : entry
      )
    );
    try {
      await loopService.setLoopItemDone(db, activeLoop.id, item.id, nextDone);
    } catch (error) {
      setItems((previous) =>
        previous.map((entry) =>
          entry.id === item.id ? { ...entry, done: item.done } : entry
        )
      );
      Alert.alert(
        'Could not update capsule',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const handleStop = async () => {
    if (!activeLoop) return;
    if (activeLoop.status === 'ACTIVE') {
      setBusy(true);
      try {
        const paused = await loopService.pauseLoop(db, activeLoop.id);
        await syncLoopNotification(db, paused).catch(() => undefined);
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
    } else {
      await syncLoopNotification(db, activeLoop).catch(() => undefined);
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

  const handleDelete = async () => {
    if (!activeLoop || deleting) return;
    setDeleting(true);
    try {
      await cancelLoopNotification(db, activeLoop.id).catch(() => undefined);
      await loopService.deleteLoop(db, activeLoop.id);
      await refresh(db);
      setDeleteVisible(false);
      goToToday(router);
    } catch (error) {
      Alert.alert(
        'Could not delete loop',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setDeleting(false);
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

      {items.length > 0 ? (
        <View style={styles.itemsSection}>
          <View style={styles.itemsHeader}>
            <Text style={[styles.itemsTitle, { color: colors.textSecondary }]}>
              CAPSULES
            </Text>
            <Text style={[styles.itemsCount, { color: colors.textSecondary }]}>
              {items.filter((item) => item.done).length}/{items.length} done
            </Text>
          </View>
          <View style={styles.capsuleWrap}>
            {items.map((item) => (
              <LoopItemCapsule
                key={item.id}
                text={item.text}
                done={item.done}
                onPress={() => {
                  void toggleItem(item);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

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

      <LoopTimeline events={buildLoopTimeline(activeLoop, intervals)} />

      <LoopControls
        status={isPaused ? 'PAUSED' : 'ACTIVE'}
        busy={busy}
        onPause={() => {
          void runAction(async () => {
            const paused = await loopService.pauseLoop(db, activeLoop.id);
            await syncLoopNotification(db, paused).catch(() => undefined);
          });
        }}
        onResume={() => {
          void runAction(async () => {
            const resumed = await loopService.resumeLoop(db, activeLoop.id);
            await syncLoopNotification(db, resumed, { requestPermission: true }).catch(
              () => undefined
            );
          });
        }}
        onStop={() => {
          void handleStop();
        }}
        onMinimize={() => {
          goToToday(router);
        }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete loop"
        disabled={deleting}
        onPress={() => setDeleteVisible(true)}
        style={({ pressed }) => [
          styles.deleteAction,
          { opacity: deleting ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.deleteText, { color: colors.danger }]}>
          Delete loop
        </Text>
      </Pressable>

      <ConfirmDialog
        visible={deleteVisible}
        title={`Delete H${activeLoop.sequence_number}?`}
        message={`This permanently removes this loop and ${formatElapsed(
          elapsedSeconds
        )} of recorded focus time. This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        destructive
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => {
          if (!deleting) setDeleteVisible(false);
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
  itemsSection: {
    gap: spacing.sm,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemsTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  itemsCount: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  capsuleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  deleteAction: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
