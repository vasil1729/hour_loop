import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { ConfirmDialog } from '../../src/components/common/ConfirmDialog';
import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { LoopItemCapsule } from '../../src/components/loops/LoopItemCapsule';
import { LoopClock } from '../../src/components/timer/LoopClock';
import { LoopControls } from '../../src/components/timer/LoopControls';
import { LoopTimeline } from '../../src/components/timer/LoopTimeline';
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
  const [newCapsuleText, setNewCapsuleText] = useState('');
  const [addingCapsule, setAddingCapsule] = useState(false);
  const [removingCapsuleId, setRemovingCapsuleId] = useState<string | null>(
    null
  );

  useFocusEffect(
    useCallback(() => {
      const loopId = activeLoop?.id;
      if (!loopId) {
        setItems([]);
        return;
      }
      let cancelled = false;
      void loopService
        .ensureCurrentItemInterval(db, loopId)
        .catch(() => undefined);
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

  const currentItem = items.find((item) => item.current) ?? null;

  const toggleItem = async (item: LoopItem) => {
    if (!activeLoop) return;
    const nextDone = !item.done;
    setItems((previous) =>
      previous.map((entry) =>
        entry.id === item.id
          ? { ...entry, done: nextDone, current: nextDone ? false : entry.current }
          : entry
      )
    );
    try {
      await loopService.setLoopItemDone(db, activeLoop.id, item.id, nextDone);
    } catch (error) {
      setItems((previous) =>
        previous.map((entry) =>
          entry.id === item.id
            ? { ...entry, done: item.done, current: item.current }
            : entry
        )
      );
      Alert.alert(
        'Could not update capsule',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const selectItem = async (item: LoopItem) => {
    if (!activeLoop || item.done) return;
    const previous = items;
    const nextId = item.current ? null : item.id;
    setItems((current) =>
      current.map((entry) => ({ ...entry, current: entry.id === nextId }))
    );
    try {
      await loopService.setCurrentLoopItem(db, activeLoop.id, nextId);
    } catch (error) {
      setItems(previous);
      Alert.alert(
        'Could not set the current capsule',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const addCapsule = async () => {
    if (!activeLoop || addingCapsule) return;
    const text = newCapsuleText.trim();
    if (!text) return;
    setAddingCapsule(true);
    try {
      const item = await loopService.addLoopItem(db, activeLoop.id, text);
      setItems((previous) => [...previous, item]);
      setNewCapsuleText('');
    } catch (error) {
      Alert.alert(
        'Could not update capsule',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setAddingCapsule(false);
    }
  };

  const removeCapsule = async (item: LoopItem) => {
    if (!activeLoop || removingCapsuleId) return;
    const previous = items;
    setRemovingCapsuleId(item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    try {
      await loopService.deleteLoopItem(db, activeLoop.id, item.id);
    } catch (error) {
      setItems(previous);
      Alert.alert(
        'Could not update capsule',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setRemovingCapsuleId(null);
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
              backgroundColor:
                isPaused || reachedTarget ? colors.surfaceAlt : colors.accentSoft,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: reachedTarget
                  ? colors.success
                  : isPaused
                    ? colors.textSecondary
                    : colors.accent,
              },
            ]}
          >
            {reachedTarget ? 'TARGET REACHED' : isPaused ? 'PAUSED' : 'FOCUSING'}
          </Text>
        </View>
      </View>

      <LoopClock
        loop={activeLoop}
        elapsedSeconds={elapsedSeconds}
        targetSeconds={activeLoop.target_duration_seconds}
      />

      {currentItem ? (
        <View
          style={[
            styles.nowCard,
            { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          ]}
        >
          <Text style={[styles.nowLabel, { color: colors.accent }]}>NOW</Text>
          <Text style={[styles.nowText, { color: colors.text }]}>
            {currentItem.text}
          </Text>
        </View>
      ) : null}

      <View style={styles.itemsSection}>
        <View style={styles.itemsHeader}>
          <Text style={[styles.itemsTitle, { color: colors.textSecondary }]}>
            CAPSULES
          </Text>
          <Text style={[styles.itemsCount, { color: colors.textSecondary }]}>
            {items.filter((item) => item.done).length}/{items.length} done
          </Text>
        </View>
        <Text style={[styles.itemsHint, { color: colors.textSecondary }]}>
          Tap to focus · swipe right to complete
        </Text>
        {items.length > 0 ? (
          <View style={styles.capsuleWrap}>
            {items.map((item) => (
              <LoopItemCapsule
                key={item.id}
                text={item.text}
                done={item.done}
                current={item.current}
                disabled={removingCapsuleId === item.id}
                onPress={() => {
                  void selectItem(item);
                }}
                onToggleDone={() => {
                  void toggleItem(item);
                }}
                onSwipeDone={() => {
                  if (!item.done) void toggleItem(item);
                }}
                onSwipeUndone={() => {
                  if (item.done) void toggleItem(item);
                }}
                onRemove={() => {
                  void removeCapsule(item);
                }}
              />
            ))}
          </View>
        ) : (
          <Text style={[styles.itemsHint, { color: colors.textSecondary }]}>
            No capsules yet.
          </Text>
        )}
        <View style={styles.addRow}>
          <TextInput
            value={newCapsuleText}
            onChangeText={setNewCapsuleText}
            placeholder="Add capsule"
            placeholderTextColor={colors.textSecondary}
            editable={!addingCapsule}
            returnKeyType="done"
            onSubmitEditing={() => {
              void addCapsule();
            }}
            maxLength={120}
            style={[
              styles.addInput,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add capsule"
            disabled={!newCapsuleText.trim() || addingCapsule}
            onPress={() => {
              void addCapsule();
            }}
            style={[
              styles.addButton,
              {
                backgroundColor: colors.accent,
                opacity:
                  newCapsuleText.trim() && !addingCapsule ? 1 : 0.45,
              },
            ]}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

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

      <LoopTimeline
        events={buildLoopTimeline(activeLoop, intervals)}
        referenceTime={new Date()}
      />

      <LoopControls
        status={isPaused ? 'PAUSED' : 'ACTIVE'}
        targetReached={reachedTarget}
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
  focusCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
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
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  itemsCount: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  itemsHint: {
    fontSize: 11,
    lineHeight: 16,
  },
  nowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  nowLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  nowText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  capsuleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
