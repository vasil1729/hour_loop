import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LoadingScreen } from '../common/LoadingScreen';
import { Screen } from '../common/Screen';
import { LoopItemCapsule } from '../loops/LoopItemCapsule';
import { LoopClock } from './LoopClock';
import { LoopControls } from './LoopControls';
import { LoopTimeline } from './LoopTimeline';
import {
  currentDayKey,
  formatShortDayLabel,
  formatWeekdayShort,
} from '../../domain/shared/dateUtils';
import {
  formatDurationCompact,
  formatElapsed,
} from '../../domain/timer/timerEngine';
import type { LoopItem } from '../../domain/types';
import { getMaxSequenceForDate } from '../../database/repositories/loopsRepository';
import { loopService } from '../../features/loops/loopService';
import { buildLoopTimeline } from '../../features/loops/loopTimeline';
import { shouldOpenCompletionJournal } from '../../features/loops/loopTarget';
import { useActiveLoop } from '../../hooks/useActiveLoop';
import { useIntentions } from '../../hooks/useIntentions';
import { localizeError } from '../../i18n';
import { useTranslation } from '../../i18n/I18nProvider';
import {
  cancelLoopNotification,
  syncLoopNotification,
} from '../../services/notifications/notificationService';
import { useSettingsStore } from '../../store/settingsStore';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

export function TimerScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { activeLoop, elapsedSeconds, loading, refresh, intervals } =
    useActiveLoop();
  const { daily } = useIntentions();
  const defaultDurationSeconds = useSettingsStore(
    (state) => state.defaultDurationSeconds
  );

  const [items, setItems] = useState<LoopItem[]>([]);
  const [nextSequence, setNextSequence] = useState(1);
  const [newCapsuleText, setNewCapsuleText] = useState('');
  const [busy, setBusy] = useState(false);
  const [addingCapsule, setAddingCapsule] = useState(false);
  const [deletingCapsuleId, setDeletingCapsuleId] = useState<string | null>(
    null
  );
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const autoJournalLoopRef = useRef<string | null>(null);

  const todayKey = currentDayKey();
  const activeLoopId = activeLoop?.id;
  const reachedTarget = activeLoop
    ? elapsedSeconds >= activeLoop.target_duration_seconds
    : false;
  const currentItem = items.find((item) => item.current) ?? null;
  const displaySequence = activeLoop?.sequence_number ?? nextSequence;
  const displayTarget =
    activeLoop?.target_duration_seconds ?? defaultDurationSeconds;
  const statusLabel = reachedTarget
    ? t('loopActive.statusTargetReached')
    : activeLoop?.status === 'PAUSED'
      ? t('loopActive.statusPaused')
      : t('timer.statusRunning');
  const dateLine = `${formatWeekdayShort(todayKey)}, ${formatShortDayLabel(
    todayKey
  )} · ${t('day.focused', {
    duration: formatDurationCompact(daily?.actualSeconds ?? 0),
  })}`;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        if (activeLoopId) {
          await loopService
            .ensureCurrentItemInterval(db, activeLoopId)
            .catch(() => undefined);
          const result = await loopService
            .getLoopItems(db, activeLoopId)
            .catch(() => []);
          if (!cancelled) setItems(result);
          return;
        }

        const maxSequence = await getMaxSequenceForDate(db, todayKey).catch(
          () => 0
        );
        if (!cancelled) {
          setItems([]);
          setNextSequence(maxSequence + 1);
        }
      };

      void load();
      return () => {
        cancelled = true;
      };
    }, [activeLoopId, db, todayKey])
  );

  useEffect(() => {
    if (loading || !activeLoop) return;
    if (!shouldOpenCompletionJournal(activeLoop, elapsedSeconds)) return;
    if (autoJournalLoopRef.current === activeLoop.id) return;
    if (
      busy ||
      deleting ||
      deleteVisible ||
      menuVisible ||
      addingCapsule ||
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
    loading,
    menuVisible,
    newCapsuleText,
    router,
  ]);

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await refresh(db);
    } catch (error) {
      Alert.alert(t('loopActive.updateFailed'), localizeError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      const loop = await loopService.startLoop(db, {
        targetDurationSeconds: defaultDurationSeconds,
      });
      await syncLoopNotification(db, loop, { requestPermission: true }).catch(
        () => undefined
      );
      await refresh(db);
    } catch (error) {
      Alert.alert(t('loopStart.couldNotStart'), localizeError(error));
    } finally {
      setBusy(false);
    }
  };

  const handlePause = () => {
    if (!activeLoop) return;
    void runAction(async () => {
      const paused = await loopService.pauseLoop(db, activeLoop.id);
      await syncLoopNotification(db, paused).catch(() => undefined);
    });
  };

  const handleResume = () => {
    if (!activeLoop) return;
    void runAction(async () => {
      const resumed = await loopService.resumeLoop(db, activeLoop.id);
      await syncLoopNotification(db, resumed, {
        requestPermission: true,
      }).catch(() => undefined);
    });
  };

  const handleStop = async () => {
    if (!activeLoop) return;
    setBusy(true);
    try {
      if (activeLoop.status === 'ACTIVE') {
        const paused = await loopService.pauseLoop(db, activeLoop.id);
        await syncLoopNotification(db, paused).catch(() => undefined);
      } else {
        await syncLoopNotification(db, activeLoop).catch(() => undefined);
      }
      await refresh(db);
    } catch (error) {
      Alert.alert(t('loopActive.couldNotStop'), localizeError(error));
      return;
    } finally {
      setBusy(false);
    }
    router.push({
      pathname: '/loop/complete',
      params: { loopId: activeLoop.id },
    });
  };

  const handleDelete = async () => {
    if (!activeLoop || deleting) return;
    setDeleting(true);
    try {
      await cancelLoopNotification(db, activeLoop.id).catch(() => undefined);
      await loopService.deleteLoop(db, activeLoop.id);
      autoJournalLoopRef.current = null;
      setItems([]);
      setDeleteVisible(false);
      setMenuVisible(false);
      await refresh(db);
    } catch (error) {
      Alert.alert(t('loopActive.couldNotDelete'), localizeError(error));
    } finally {
      setDeleting(false);
    }
  };

  const selectCapsule = async (item: LoopItem) => {
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
      Alert.alert(t('loopActive.couldNotSetCurrent'), localizeError(error));
    }
  };

  const toggleCapsule = async (item: LoopItem) => {
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
      Alert.alert(t('loopActive.couldNotUpdateCapsule'), localizeError(error));
    }
  };

  const deleteCapsule = async (item: LoopItem) => {
    if (!activeLoop || deletingCapsuleId) return;
    const previous = items;
    setDeletingCapsuleId(item.id);
    try {
      await loopService.deleteLoopItem(db, activeLoop.id, item.id);
      const updated = await loopService.getLoopItems(db, activeLoop.id);
      setItems(updated);
      await refresh(db);
    } catch (error) {
      setItems(previous);
      Alert.alert(t('loopActive.couldNotUpdateCapsule'), localizeError(error));
    } finally {
      setDeletingCapsuleId(null);
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
      Alert.alert(t('loopActive.couldNotUpdateCapsule'), localizeError(error));
    } finally {
      setAddingCapsule(false);
    }
  };

  if (loading) {
    return <LoadingScreen message={t('loopActive.recovering')} />;
  }

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.hour, { color: colors.text }]}>
            H{displaySequence}
          </Text>
          <View style={styles.headerRight}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('assistant.open')}
              onPress={() => router.push('/assistant')}
              hitSlop={8}
              style={({ pressed }) => [
                styles.assistantButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
              <Text style={[styles.assistantText, { color: colors.accent }]}>
                {t('assistant.open')}
              </Text>
            </Pressable>

            {activeLoop ? (
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: reachedTarget
                      ? colors.surfaceAlt
                      : activeLoop.status === 'PAUSED'
                        ? colors.surfaceAlt
                        : colors.accentSoft,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: reachedTarget
                        ? colors.success
                        : activeLoop.status === 'PAUSED'
                          ? colors.textSecondary
                          : colors.accent,
                    },
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            ) : null}

            {activeLoop ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('loopActive.delete')}
                onPress={() => setMenuVisible(true)}
                hitSlop={8}
                style={[styles.menuButton, { backgroundColor: colors.surface }]}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={16}
                  color={colors.text}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.subheader, { color: colors.textSecondary }]}
        >
          {dateLine}
        </Text>
      </View>

      <LoopClock
        elapsedSeconds={activeLoop ? elapsedSeconds : 0}
        targetSeconds={displayTarget}
        status={activeLoop?.status ?? 'IDLE'}
      />

      {activeLoop && currentItem ? (
        <Text
          numberOfLines={1}
          style={[styles.currentCapsule, { color: colors.accent }]}
        >
          {currentItem.text}
        </Text>
      ) : null}

      {activeLoop ? (
        <LoopControls
          status={activeLoop.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'}
          targetReached={reachedTarget}
          busy={busy}
          onPause={handlePause}
          onResume={handleResume}
          onStop={() => {
            void handleStop();
          }}
        />
      ) : (
        <Button
          label={t('loopStart.start')}
          onPress={() => {
            void handleStart();
          }}
          loading={busy}
          style={styles.startButton}
        />
      )}

      {activeLoop ? (
        <View style={styles.capsulesSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {t('loopActive.capsules')}
            </Text>
            <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
              {t('common.doneCount', {
                done: items.filter((item) => item.done).length,
                total: items.length,
              })}
            </Text>
          </View>

          {items.length > 0 ? (
            <View style={styles.capsuleWrap}>
              {items.map((item) => (
                <LoopItemCapsule
                  key={item.id}
                  text={item.text}
                  done={item.done}
                  current={item.current}
                  disabled={deletingCapsuleId === item.id || busy}
                  onPress={() => {
                    void selectCapsule(item);
                  }}
                  onSwipeDone={() => {
                    if (!item.done) void toggleCapsule(item);
                  }}
                  onSwipeDelete={() => {
                    void deleteCapsule(item);
                  }}
                />
              ))}
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {t('loopStart.capsulesHelper')}
            </Text>
          )}

          <View style={styles.addRow}>
            <TextInput
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
      ) : null}

      {activeLoop ? (
        <LoopTimeline
          events={buildLoopTimeline(activeLoop, intervals)}
          referenceTime={new Date()}
          collapsible
        />
      ) : null}

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={() => setMenuVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.menuCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('loopActive.delete')}
              onPress={() => {
                setMenuVisible(false);
                setDeleteVisible(true);
              }}
              style={({ pressed }) => [
                styles.menuItem,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={colors.danger}
              />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>
                {t('loopActive.delete')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {activeLoop ? (
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
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  header: {
    gap: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hour: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subheader: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  assistantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  assistantText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  menuButton: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentCapsule: {
    marginTop: -spacing.xs,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  startButton: {
    marginTop: spacing.xs,
  },
  capsulesSection: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  sectionCount: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  capsuleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hint: {
    fontSize: 11,
    lineHeight: 16,
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
    fontSize: 14,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 72,
    paddingRight: spacing.md,
  },
  menuCard: {
    minWidth: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
