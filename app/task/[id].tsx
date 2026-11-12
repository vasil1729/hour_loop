import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { ConfirmDialog } from '../../src/components/common/ConfirmDialog';
import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { LoopHistoryRow } from '../../src/components/history/LoopHistoryRow';
import { LoopItemCapsule } from '../../src/components/loops/LoopItemCapsule';
import { TaskFormModal } from '../../src/components/tasks/TaskFormModal';
import { TaskRow } from '../../src/components/tasks/TaskRow';
import type { Capsule } from '../../src/domain/capsules/capsuleDomain';
import { formatDurationCompact } from '../../src/domain/timer/timerEngine';
import { flattenTree, type FlatTaskNode } from '../../src/domain/tasks/taskDomain';
import { setCapsuleDone } from '../../src/features/capsules/capsuleService';
import {
  createTask,
  getTaskDetail,
  setTaskStatus,
  updateTaskDetails,
  type TaskDetail,
} from '../../src/features/tasks/taskService';
import { localizeError } from '../../src/i18n';
import { useTranslation } from '../../src/i18n/I18nProvider';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function TaskDetailScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, isRTL } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const taskId = typeof params.id === 'string' ? params.id : undefined;

  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [addSubtaskVisible, setAddSubtaskVisible] = useState(false);
  const [archiveVisible, setArchiveVisible] = useState(false);

  const reload = useCallback(async () => {
    if (!taskId) {
      setLoading(false);
      return;
    }
    try {
      const result = await getTaskDetail(db, taskId);
      if (!result) {
        setError(t('task.noLongerExists'));
      } else {
        setDetail(result);
        setError(null);
      }
    } catch (caught) {
      setError(localizeError(caught, 'task.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  }, [db, taskId, t]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void reload().then(() => {
        if (cancelled) return;
      });
      return () => {
        cancelled = true;
      };
    }, [reload])
  );

  const subtreeRows = useMemo<FlatTaskNode[]>(() => {
    if (!detail) return [];
    const all = [detail.task, ...detail.descendantTasks];
    const expanded = new Set(all.map((task) => task.id));
    return flattenTree(all, expanded).filter((row) => row.task.id !== detail.task.id);
  }, [detail]);

  const handleToggleComplete = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await setTaskStatus(
        db,
        detail.task.id,
        detail.task.status === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED'
      );
      await reload();
    } catch (caught) {
      Alert.alert(
        t('task.couldNotUpdate'),
        localizeError(caught)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (values: { title: string; description: string }) => {
    if (!detail) return;
    setSaving(true);
    try {
      await updateTaskDetails(db, detail.task.id, {
        title: values.title,
        description: values.description,
      });
      setEditVisible(false);
      await reload();
    } catch (caught) {
      Alert.alert(
        t('task.couldNotSave'),
        localizeError(caught)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubtask = async (values: {
    title: string;
    description: string;
  }) => {
    if (!detail) return;
    setSaving(true);
    try {
      await createTask(db, {
        title: values.title,
        description: values.description,
        parentTaskId: detail.task.id,
      });
      setAddSubtaskVisible(false);
      await reload();
    } catch (caught) {
      Alert.alert(
        t('task.couldNotAddCapsule'),
        localizeError(caught)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSubtask = async (task: { id: string; status: string }) => {
    try {
      await setTaskStatus(
        db,
        task.id,
        task.status === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED'
      );
      await reload();
    } catch (caught) {
      Alert.alert(
        t('task.couldNotUpdateCapsule'),
        localizeError(caught)
      );
    }
  };

  const handleCompleteCapsule = async (capsule: Capsule) => {
    try {
      await setCapsuleDone(db, capsule, true);
      await reload();
    } catch (caught) {
      Alert.alert(
        t('task.couldNotUpdateCapsule'),
        localizeError(caught)
      );
    }
  };

  const handleArchive = async () => {
    if (!detail) return;
    setArchiveVisible(false);
    setSaving(true);
    try {
      await setTaskStatus(db, detail.task.id, 'ARCHIVED');
      router.back();
    } catch (caught) {
      Alert.alert(
        t('task.couldNotArchive'),
        localizeError(caught)
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !detail) {
    return (
      <Screen>
        <EmptyState
          title={t('task.notFoundTitle')}
          message={error ?? t('task.unavailable')}
        />
      </Screen>
    );
  }

  const { task, progress, loops, capsules, totalSeconds } = detail;
  const completed = task.status === 'COMPLETED';
  const archived = task.status === 'ARCHIVED';
  const isSubtask = task.parent_task_id !== null;
  const canStartLoop = isSubtask && !completed && !archived;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('task.backA11y')}
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('task.editA11y')}
          onPress={() => setEditVisible(true)}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Ionicons name="create-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.header}>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: completed
                ? colors.surfaceAlt
                : task.status === 'IN_PROGRESS'
                  ? colors.accentSoft
                  : colors.surfaceAlt,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: completed
                  ? colors.textSecondary
                  : task.status === 'IN_PROGRESS'
                    ? colors.accent
                    : colors.textSecondary,
              },
            ]}
          >
            {t(
              task.status === 'COMPLETED'
                ? 'task.statusCompleted'
                : task.status === 'IN_PROGRESS'
                  ? 'task.statusInProgress'
                  : task.status === 'ARCHIVED'
                    ? 'task.statusArchived'
                    : 'task.statusNotStarted'
            )}
          </Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{task.title}</Text>
        {task.description ? (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {task.description}
          </Text>
        ) : null}
      </View>

      <View style={styles.metrics}>
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            {t('task.focused')}
          </Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {formatDurationCompact(totalSeconds)}
          </Text>
          <Text style={[styles.metricMeta, { color: colors.textSecondary }]}>
            {t('task.loopsCount', { count: loops.length })}
          </Text>
        </View>
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            {t('task.capsules')}
          </Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {progress.completed}/{progress.total}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(progress.ratio * 100)}%`,
                  backgroundColor: colors.success,
                },
              ]}
            />
          </View>
        </View>
      </View>

      {!canStartLoop ? (
        <View
          style={[
            styles.hint,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {archived
              ? t('task.hintArchived')
              : isSubtask
                ? t('task.hintReopen')
                : t('task.hintContainer')}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {canStartLoop ? (
          <Button
            label={t('task.startLoop')}
            onPress={() =>
              router.push({
                pathname: '/loop/start',
                params: { taskId: task.id },
              })
            }
            style={styles.action}
          />
        ) : null}
        <Button
          label={completed ? t('task.reopen') : t('task.complete')}
          variant="secondary"
          onPress={() => {
            void handleToggleComplete();
          }}
          loading={saving}
          style={styles.action}
        />
      </View>
      <View style={styles.actions}>
        <Button
          label={t('task.addCapsule')}
          variant="secondary"
          onPress={() => setAddSubtaskVisible(true)}
          style={styles.action}
        />
        <Button
          label={t('task.archive')}
          variant="ghost"
          onPress={() => setArchiveVisible(true)}
          style={styles.action}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('task.capsulesSection')}
        </Text>
        {subtreeRows.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {t('task.noCapsules')}
          </Text>
        ) : (
          <View style={styles.subtasks}>
            {subtreeRows.map((row) => (
              <TaskRow
                key={row.task.id}
                task={row.task}
                depth={Math.max(0, row.depth - 1)}
                hasChildren={row.hasChildren}
                isExpanded
                onToggleExpand={() => undefined}
                onPress={() => router.push(`/task/${row.task.id}`)}
                showChevron={false}
                onToggleComplete={() => {
                  void handleToggleSubtask(row.task);
                }}
              />
            ))}
          </View>
        )}
      </View>

      {capsules.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('task.openCapsules')}
            </Text>
            <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
              {t('common.openCount', { count: capsules.length })}
            </Text>
          </View>
          <View style={styles.capsuleWrap}>
            {capsules.map((capsule) => (
              <LoopItemCapsule
                key={capsule.item.id}
                text={capsule.item.text}
                pressAccessibilityLabel={t('tasks.completeCapsuleA11y', {
                  text: capsule.item.text,
                })}
                onPress={() => {
                  void handleCompleteCapsule(capsule);
                }}
              />
            ))}
          </View>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {isSubtask
              ? t('task.openCapsulesHintSubtask')
              : t('task.openCapsulesHintContainer')}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('task.loopHistory')}
        </Text>
        {loops.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {t('task.noLoops')}
          </Text>
        ) : (
          <View style={styles.loopList}>
            {loops.map((entry) => (
              <LoopHistoryRow
                key={entry.loop.id}
                loop={entry.loop}
                elapsedSeconds={entry.elapsedSeconds}
                showDate
                onPress={() => router.push(`/loop/${entry.loop.id}`)}
              />
            ))}
          </View>
        )}
      </View>

      <TaskFormModal
        visible={editVisible}
        heading={t('task.editTask')}
        initialTitle={task.title}
        initialDescription={task.description ?? ''}
        busy={saving}
        onSave={(values) => {
          void handleSaveEdit(values);
        }}
        onClose={() => setEditVisible(false)}
      />

      <TaskFormModal
        visible={addSubtaskVisible}
        heading={t('task.newCapsule')}
        parentTitle={task.title}
        busy={saving}
        onSave={(values) => {
          void handleAddSubtask(values);
        }}
        onClose={() => setAddSubtaskVisible(false)}
      />

      <ConfirmDialog
        visible={archiveVisible}
        title={t('task.archiveTitle')}
        message={t('task.archiveMessage')}
        confirmLabel={t('task.archive')}
        destructive
        onConfirm={() => {
          void handleArchive();
        }}
        onCancel={() => setArchiveVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    gap: spacing.sm,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  hint: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 19,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricMeta: {
    fontSize: 12,
  },
  progressTrack: {
    height: 5,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: {
    height: '100%',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionMeta: {
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
  subtasks: {
    gap: spacing.sm,
  },
  loopList: {
    gap: spacing.sm,
  },
  muted: {
    fontSize: 14,
    lineHeight: 21,
  },
});
