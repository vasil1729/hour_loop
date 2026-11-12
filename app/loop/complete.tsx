import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { ConfirmDialog } from '../../src/components/common/ConfirmDialog';
import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { LoopItemCapsule } from '../../src/components/loops/LoopItemCapsule';
import { LoopClock } from '../../src/components/timer/LoopClock';
import { LoopTimeline } from '../../src/components/timer/LoopTimeline';
import { TaskPicker } from '../../src/components/tasks/TaskPicker';
import { formatDayLabel } from '../../src/domain/shared/dateUtils';
import { formatDurationCompact } from '../../src/domain/timer/timerEngine';
import type { Loop, LoopInterval, LoopItem, Task } from '../../src/domain/types';
import { loopService } from '../../src/features/loops/loopService';
import { buildLoopTimeline } from '../../src/features/loops/loopTimeline';
import { localizeError } from '../../src/i18n';
import { useTranslation } from '../../src/i18n/I18nProvider';
import { goToToday } from '../../src/services/navigation/navigationService';
import {
  cancelLoopNotification,
  syncLoopNotification,
} from '../../src/services/notifications/notificationService';
import { listTasks } from '../../src/features/tasks/taskService';
import { useLoopStore } from '../../src/store/loopStore';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function CompleteLoopScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ loopId?: string }>();
  const loopId = typeof params.loopId === 'string' ? params.loopId : undefined;
  const refreshLoop = useLoopStore((state) => state.refresh);

  const [loop, setLoop] = useState<Loop | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [intervals, setIntervals] = useState<LoopInterval[]>([]);
  const [items, setItems] = useState<LoopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focus, setFocus] = useState('');
  const [carryIn, setCarryIn] = useState('');
  const [done, setDone] = useState('');
  const [rollForward, setRollForward] = useState('');
  const [note, setNote] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rollForwardTaskId, setRollForwardTaskId] = useState<string | null>(null);
  const [taskPickerVisible, setTaskPickerVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!loopId) {
        setLoading(false);
        return;
      }
      try {
        const [result, loopItems] = await Promise.all([
          loopService.getLoopWithElapsed(db, loopId),
          loopService.getLoopItems(db, loopId),
        ]);
        if (cancelled) return;
        setLoop(result.loop);
        setElapsedSeconds(result.elapsedSeconds);
        setIntervals(result.intervals);
        setItems(loopItems);
        setFocus(result.loop.focus ?? '');
        setCarryIn(result.loop.carry_in ?? '');
        setDone(result.loop.done ?? '');
        setRollForward(result.loop.roll_forward ?? '');
        setNote(result.loop.note ?? '');
        setRollForwardTaskId(result.loop.roll_forward_task_id);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : t('loopComplete.notFound')
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [db, loopId, t]);

  useEffect(() => {
    let cancelled = false;
    void listTasks(db, 'active').then((result) => {
      if (!cancelled) setTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const toggleItem = async (item: LoopItem) => {
    if (!loop) return;
    const nextDone = !item.done;
    setItems((previous) =>
      previous.map((entry) =>
        entry.id === item.id ? { ...entry, done: nextDone } : entry
      )
    );
    try {
      await loopService.setLoopItemDone(db, loop.id, item.id, nextDone);
    } catch (caught) {
      setItems((previous) =>
        previous.map((entry) =>
          entry.id === item.id ? { ...entry, done: item.done } : entry
        )
      );
      Alert.alert(
        t('loopComplete.couldNotUpdateCapsule'),
        localizeError(caught)
      );
    }
  };

  const handleKeepLooping = async () => {
    if (!loop) return;
    if (loop.status === 'PAUSED') {
      setBusy(true);
      try {
        const resumed = await loopService.resumeLoop(db, loop.id);
        await syncLoopNotification(db, resumed, { requestPermission: true }).catch(
          () => undefined
        );
        await refreshLoop(db);
      } catch (caught) {
        Alert.alert(
          t('loopComplete.couldNotResume'),
          localizeError(caught)
        );
        return;
      } finally {
        setBusy(false);
      }
    }
    router.back();
  };

  const handleSave = async () => {
    if (!loop) return;
    if (loop.status === 'COMPLETED') {
      goToToday(router);
      return;
    }

    setBusy(true);
    try {
      await loopService.completeLoop(db, loop.id, {
        focus,
        carryIn,
        done,
        rollForward,
        rollForwardTaskId,
        note,
      });
      await cancelLoopNotification(db, loop.id).catch(() => undefined);
      await refreshLoop(db);
      goToToday(router);
    } catch (caught) {
      Alert.alert(
        t('loopComplete.couldNotClose'),
        localizeError(caught)
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!loop || deleting) return;
    setDeleting(true);
    try {
      await cancelLoopNotification(db, loop.id).catch(() => undefined);
      await loopService.deleteLoop(db, loop.id);
      await refreshLoop(db);
      setDeleteVisible(false);
      goToToday(router);
    } catch (caught) {
      Alert.alert(
        t('loopComplete.couldNotDelete'),
        localizeError(caught)
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <LoadingScreen message={t('loopComplete.loading')} />;
  }

  if (error || !loop) {
    return (
      <Screen>
        <EmptyState
          title={t('loopComplete.notFound')}
          message={error ?? t('loopComplete.unavailable')}
          action={
            <Button
              label={t('loopComplete.backToToday')}
              onPress={() => goToToday(router)}
            />
          }
        />
      </Screen>
    );
  }

  const readOnly = loop.status === 'COMPLETED';
  const targetReached = elapsedSeconds >= loop.target_duration_seconds;

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
          {t('loopComplete.eyebrow')}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          H{loop.sequence_number} · {formatDurationCompact(elapsedSeconds)}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {formatDayLabel(loop.local_date)}
        </Text>
      </View>

      {readOnly ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          ]}
        >
          <Text style={[styles.noticeText, { color: colors.accent }]}>
            {t('loopComplete.alreadyComplete')}
          </Text>
        </View>
      ) : null}
      {!readOnly && targetReached ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.success,
            },
          ]}
        >
          <Text style={[styles.noticeText, { color: colors.success }]}>
            {t('loopComplete.targetReachedNotice')}
          </Text>
        </View>
      ) : null}

      <LoopClock
        loop={loop}
        elapsedSeconds={elapsedSeconds}
        targetSeconds={loop.target_duration_seconds}
      />

      <LoopTimeline
        events={buildLoopTimeline(loop, intervals, { closing: !readOnly })}
      />

      {items.length > 0 ? (
        <View style={styles.field}>
          <View style={styles.itemsHeader}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {t('loopComplete.capsules')}
            </Text>
            <Text style={[styles.itemsCount, { color: colors.textSecondary }]}>
              {t('common.doneCount', {
                done: items.filter((item) => item.done).length,
                total: items.length,
              })}
            </Text>
          </View>
          <View style={styles.capsuleWrap}>
            {items.map((item) => (
              <LoopItemCapsule
                key={item.id}
                text={item.text}
                done={item.done}
                onPress={
                  readOnly
                    ? undefined
                    : () => {
                        void toggleItem(item);
                      }
                }
              />
            ))}
          </View>
        </View>
      ) : (
        <>
          <Field
            label={t('loopComplete.focus')}
            value={focus}
            onChangeText={setFocus}
            placeholder={t('loopComplete.focusPlaceholder')}
            editable={!readOnly}
            multiline
          />
          <Field
            label={t('loopComplete.carryIn')}
            value={carryIn}
            onChangeText={setCarryIn}
            placeholder={t('loopComplete.carryInPlaceholder')}
            editable={!readOnly}
            multiline
          />
        </>
      )}
      <Field
        label={t('loopComplete.done')}
        value={done}
        onChangeText={setDone}
        placeholder={t('loopComplete.donePlaceholder')}
        editable={!readOnly}
        multiline
      />
      <Field
        label={t('loopComplete.rollForward')}
        value={rollForward}
        onChangeText={setRollForward}
        placeholder={t('loopComplete.rollForwardPlaceholder')}
        editable={!readOnly}
        multiline
      />
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t('loopComplete.rollForwardCapsule')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('loopComplete.chooseFollowUpA11y')}
          onPress={() => setTaskPickerVisible(true)}
          disabled={readOnly}
          style={[
            styles.taskSelector,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.taskSelectorText,
              { color: colors.textSecondary },
            ]}
          >
            {tasks.find((task) => task.id === rollForwardTaskId)?.title ??
              t('loopComplete.noCapsuleLinked')}
          </Text>
          <Text style={[styles.taskSelectorAction, { color: colors.accent }]}>
            {readOnly ? '' : t('common.choose')}
          </Text>
        </Pressable>
      </View>

      <Field
        label={t('loopComplete.note')}
        value={note}
        onChangeText={setNote}
        placeholder={t('loopComplete.notePlaceholder')}
        editable={!readOnly}
        multiline
      />

      <TaskPicker
        visible={taskPickerVisible}
        tasks={tasks}
        selectedTaskId={rollForwardTaskId}
        title={t('loopComplete.linkFollowUp')}
        noneLabel={t('loopComplete.noFollowUp')}
        onSelect={(taskId) => {
          setRollForwardTaskId(taskId);
          setTaskPickerVisible(false);
        }}
        onClose={() => setTaskPickerVisible(false)}
      />

      <Button
        label={
          readOnly ? t('loopComplete.backToToday') : t('loopComplete.saveClose')
        }
        onPress={() => {
          void handleSave();
        }}
        loading={busy}
      />
      {!readOnly && !targetReached ? (
        <Button
          label={t('loopComplete.keepLooping')}
          variant="ghost"
          onPress={() => {
            void handleKeepLooping();
          }}
          disabled={busy}
        />
      ) : null}

      {!readOnly ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('loopComplete.delete')}
          disabled={deleting}
          onPress={() => setDeleteVisible(true)}
          style={({ pressed }) => [
            styles.deleteAction,
            { opacity: deleting ? 0.4 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.deleteText, { color: colors.danger }]}>
            {t('loopComplete.delete')}
          </Text>
        </Pressable>
      ) : null}

      <ConfirmDialog
        visible={deleteVisible}
        title={t('loopComplete.deleteTitle', {
          sequence: loop.sequence_number,
        })}
        message={t('loopComplete.deleteMessage', {
          duration: formatDurationCompact(elapsedSeconds),
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

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  editable: boolean;
  multiline?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  editable,
  multiline = false,
}: FieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        editable={editable}
        multiline={multiline}
        maxLength={2000}
        style={[
          styles.input,
          multiline ? styles.multiline : styles.singleLine,
          {
            color: editable ? colors.text : colors.textSecondary,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
  },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  field: {
    gap: spacing.sm,
  },
  taskSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  taskSelectorText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  taskSelectorAction: {
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemsCount: {
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  multiline: {
    minHeight: 78,
    lineHeight: 21,
  },
  singleLine: {
    minHeight: 50,
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
