import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
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
import { shouldOpenCompletionJournal } from '../../src/features/loops/loopTarget';
import { localizeError } from '../../src/i18n';
import { useTranslation } from '../../src/i18n/I18nProvider';
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
  const { t } = useTranslation();
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
  const [lastCapsuleHintVisible, setLastCapsuleHintVisible] = useState(false);
  const lastCapsuleHintOpacity = useRef(new Animated.Value(0)).current;
  const lastCapsuleHintAnimation = useRef<Animated.CompositeAnimation | null>(
    null
  );
  const [shakeTarget, setShakeTarget] = useState<{
    id: string;
    signal: number;
  } | null>(null);
  const addInputRef = useRef<TextInput>(null);
  const autoJournalLoopRef = useRef<string | null>(null);

  const reachedTarget = activeLoop
    ? elapsedSeconds >= activeLoop.target_duration_seconds
    : false;

  useEffect(() => {
    if (loading || !activeLoop) return;
    if (!shouldOpenCompletionJournal(activeLoop, elapsedSeconds)) return;
    if (autoJournalLoopRef.current === activeLoop.id) return;
    if (
      busy ||
      deleting ||
      deleteVisible ||
      lastCapsuleHintVisible ||
      addingCapsule ||
      removingCapsuleId !== null ||
      newCapsuleText.trim().length > 0
    ) {
      return;
    }

    autoJournalLoopRef.current = activeLoop.id;
    router.replace({
      pathname: '/loop/complete',
      params: { loopId: activeLoop.id },
    });
  }, [
    activeLoop,
    addingCapsule,
    busy,
    deleteVisible,
    deleting,
    elapsedSeconds,
    lastCapsuleHintVisible,
    loading,
    newCapsuleText,
    removingCapsuleId,
    router,
  ]);

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
        .then(() => refresh(db))
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
    }, [db, activeLoop?.id, refresh])
  );

  useEffect(
    () => () => {
      lastCapsuleHintAnimation.current?.stop();
    },
    []
  );

  const currentItem = items.find((item) => item.current) ?? null;

  const showLastCapsuleHint = () => {
    lastCapsuleHintAnimation.current?.stop();
    lastCapsuleHintOpacity.setValue(1);
    setLastCapsuleHintVisible(true);
    lastCapsuleHintAnimation.current = Animated.sequence([
      Animated.delay(2200),
      Animated.timing(lastCapsuleHintOpacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]);
    lastCapsuleHintAnimation.current.start(({ finished }) => {
      if (finished) setLastCapsuleHintVisible(false);
    });
  };

  const hideLastCapsuleHint = () => {
    lastCapsuleHintAnimation.current?.stop();
    lastCapsuleHintOpacity.setValue(0);
    setLastCapsuleHintVisible(false);
  };

  const denyLastCapsule = (itemId: string) => {
    setShakeTarget((previous) => ({
      id: itemId,
      signal: (previous?.signal ?? 0) + 1,
    }));
    showLastCapsuleHint();
  };

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
      const updated = await loopService.getLoopItems(db, activeLoop.id);
      setItems(updated);
      await refresh(db);
    } catch (error) {
      setItems((previous) =>
        previous.map((entry) =>
          entry.id === item.id
            ? { ...entry, done: item.done, current: item.current }
            : entry
        )
      );
      Alert.alert(
        t('loopActive.couldNotUpdateCapsule'),
        localizeError(error)
      );
    }
  };

  const selectItem = async (item: LoopItem) => {
    if (!activeLoop || item.done || item.current) return;
    const previous = items;
    setItems((current) =>
      current.map((entry) => ({
        ...entry,
        current: entry.id === item.id,
      }))
    );
    try {
      await loopService.setCurrentLoopItem(db, activeLoop.id, item.id);
    } catch (error) {
      setItems(previous);
      Alert.alert(
        t('loopActive.couldNotSetCurrent'),
        localizeError(error)
      );
    }
  };

  const addCapsule = async () => {
    if (!activeLoop || addingCapsule) return;
    const text = newCapsuleText.trim();
    if (!text) return;
    setAddingCapsule(true);
    try {
      await loopService.addLoopItem(db, activeLoop.id, text);
      const updated = await loopService.getLoopItems(db, activeLoop.id);
      setItems(updated);
      setNewCapsuleText('');
    } catch (error) {
      Alert.alert(
        t('loopActive.couldNotUpdateCapsule'),
        localizeError(error)
      );
    } finally {
      setAddingCapsule(false);
    }
  };

  const removeCapsule = async (item: LoopItem) => {
    if (!activeLoop || removingCapsuleId) return;
    if (items.length <= 1) {
      denyLastCapsule(item.id);
      return;
    }
    const previous = items;
    setRemovingCapsuleId(item.id);
    try {
      await loopService.deleteLoopItem(db, activeLoop.id, item.id);
      const updated = await loopService.getLoopItems(db, activeLoop.id);
      setItems(updated);
      await refresh(db);
    } catch (error) {
      setItems(previous);
      if (error instanceof Error && error.name === 'LastLoopCapsuleError') {
        denyLastCapsule(item.id);
      } else {
        Alert.alert(
          t('loopActive.couldNotUpdateCapsule'),
          localizeError(error)
        );
      }
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
          t('loopActive.couldNotStop'),
          localizeError(error)
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
        t('loopActive.updateFailed'),
        localizeError(error)
      );
    } finally {
      setBusy(false);
    }
  };

  const pauseActiveLoop = () => {
    if (!activeLoop) return;
    void runAction(async () => {
      const paused = await loopService.pauseLoop(db, activeLoop.id);
      await syncLoopNotification(db, paused).catch(() => undefined);
    });
  };

  const resumeActiveLoop = () => {
    if (!activeLoop) return;
    void runAction(async () => {
      const resumed = await loopService.resumeLoop(db, activeLoop.id);
      await syncLoopNotification(db, resumed, {
        requestPermission: true,
      }).catch(() => undefined);
    });
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
        t('loopActive.couldNotDelete'),
        localizeError(error)
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <LoadingScreen message={t('loopActive.recovering')} />;
  }

  if (!activeLoop) {
    return (
      <Screen>
        <EmptyState
          title={t('loopActive.noLoopTitle')}
          message={t('loopActive.noLoopMessage')}
          action={
            <Button
              label={t('loopActive.start')}
              onPress={() => router.replace('/loop/start')}
            />
          }
        />
      </Screen>
    );
  }

  const isPaused = activeLoop.status === 'PAUSED';

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
            {reachedTarget
              ? t('loopActive.statusTargetReached')
              : isPaused
                ? t('loopActive.statusPaused')
                : t('loopActive.statusFocusing')}
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
          <Text style={[styles.nowLabel, { color: colors.accent }]}>
            {t('loopActive.now')}
          </Text>
          <Text style={[styles.nowText, { color: colors.text }]}>
            {currentItem.text}
          </Text>
          <Text style={[styles.nowHint, { color: colors.textSecondary }]}>
            {t('loopActive.currentHint')}
          </Text>
        </View>
      ) : items.length > 0 ? (
        <View
          style={[
            styles.nowCard,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.nowLabel, { color: colors.textSecondary }]}>
            {t('loopActive.allDoneTitle')}
          </Text>
          <Text style={[styles.nowHint, { color: colors.textSecondary }]}>
            {t('loopActive.allDoneBody')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('task.addCapsule')}
            onPress={() => addInputRef.current?.focus()}
            hitSlop={8}
          >
            <Text style={[styles.addCapsuleLink, { color: colors.accent }]}>
              {t('task.addCapsule')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.itemsSection}>
        <View style={styles.itemsHeader}>
          <Text style={[styles.itemsTitle, { color: colors.textSecondary }]}>
            {t('loopActive.capsules')}
          </Text>
          <Text style={[styles.itemsCount, { color: colors.textSecondary }]}>
            {t('common.doneCount', {
              done: items.filter((item) => item.done).length,
              total: items.length,
            })}
          </Text>
        </View>
        <Text style={[styles.itemsHint, { color: colors.textSecondary }]}>
          {t('loopActive.hint')}
        </Text>
        {lastCapsuleHintVisible ? (
          <Animated.View style={{ opacity: lastCapsuleHintOpacity }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('loopActive.lastCapsuleBody')}
              onPress={() => {
                hideLastCapsuleHint();
                addInputRef.current?.focus();
              }}
              style={[
                styles.lastCapsuleHint,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.lastCapsuleHintText,
                  { color: colors.textSecondary },
                ]}
              >
                {t('loopActive.lastCapsuleBody')}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
        {items.length > 0 ? (
          <View style={styles.capsuleWrap}>
            {items.map((item) => (
              <LoopItemCapsule
                key={item.id}
                text={item.text}
                done={item.done}
                current={item.current}
                paused={isPaused}
                shakeSignal={
                  shakeTarget?.id === item.id ? shakeTarget.signal : 0
                }
                disabled={removingCapsuleId === item.id || busy}
                onPress={() => {
                  void selectItem(item);
                }}
                onToggleDone={() => {
                  void toggleItem(item);
                }}
                onTogglePause={
                  item.current && !reachedTarget
                    ? isPaused
                      ? resumeActiveLoop
                      : pauseActiveLoop
                    : undefined
                }
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
            {t('task.noCapsules')}
          </Text>
        )}
        <View style={styles.addRow}>
          <TextInput
            ref={addInputRef}
            value={newCapsuleText}
            onChangeText={setNewCapsuleText}
            placeholder={t('task.addCapsule')}
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
            accessibilityLabel={t('task.addCapsule')}
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
            {t('loopActive.focus')}
          </Text>
          <Text style={[styles.focusText, { color: colors.text }]}>
            {activeLoop.focus}
          </Text>
        </View>
      ) : null}

      {activeLoop.carry_in ? (
        <View style={styles.carryBlock}>
          <Text style={[styles.carryLabel, { color: colors.textSecondary }]}>
            {t('loopActive.carryIn')}
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
        canResume={Boolean(currentItem)}
        onPause={pauseActiveLoop}
        onResume={resumeActiveLoop}
        onStop={() => {
          void handleStop();
        }}
        onMinimize={() => {
          goToToday(router);
        }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('loopActive.delete')}
        disabled={deleting}
        onPress={() => setDeleteVisible(true)}
        style={({ pressed }) => [
          styles.deleteAction,
          { opacity: deleting ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.deleteText, { color: colors.danger }]}>
          {t('loopActive.delete')}
        </Text>
      </Pressable>

      <ConfirmDialog
        visible={deleteVisible}
        title={t('loopActive.deleteTitle', {
          sequence: activeLoop.sequence_number,
        })}
        message={t('loopActive.deleteMessage', {
          duration: formatElapsed(elapsedSeconds),
        })}
        confirmLabel={deleting ? t('common.deleting') : t('common.delete')}
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
  lastCapsuleHint: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  lastCapsuleHintText: {
    fontSize: 12,
    lineHeight: 17,
  },
  nowCard: {
    alignItems: 'flex-start',
    gap: spacing.xs,
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
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  nowHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  addCapsuleLink: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '700',
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
