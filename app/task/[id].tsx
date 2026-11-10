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
import { TaskFormModal } from '../../src/components/tasks/TaskFormModal';
import { TaskRow } from '../../src/components/tasks/TaskRow';
import { formatDurationCompact } from '../../src/domain/timer/timerEngine';
import { flattenTree, type FlatTaskNode } from '../../src/domain/tasks/taskDomain';
import type { Task } from '../../src/domain/types';
import {
  createTask,
  getTaskDetail,
  setTaskStatus,
  updateTaskDetails,
  type TaskDetail,
} from '../../src/features/tasks/taskService';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function TaskDetailScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
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
        setError('This task no longer exists.');
      } else {
        setDetail(result);
        setError(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load task.');
    } finally {
      setLoading(false);
    }
  }, [db, taskId]);

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
        'Could not update task',
        caught instanceof Error ? caught.message : 'Please try again.'
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
        'Could not save task',
        caught instanceof Error ? caught.message : 'Please try again.'
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
        'Could not add subtask',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    } finally {
      setSaving(false);
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
        'Could not archive task',
        caught instanceof Error ? caught.message : 'Please try again.'
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
        <EmptyState title="Task not found" message={error ?? 'This task is unavailable.'} />
      </Screen>
    );
  }

  const { task, progress, loops, totalSeconds } = detail;
  const completed = task.status === 'COMPLETED';

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit task"
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
            {task.status.replace('_', ' ')}
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
            FOCUSED
          </Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {formatDurationCompact(totalSeconds)}
          </Text>
          <Text style={[styles.metricMeta, { color: colors.textSecondary }]}>
            {loops.length} {loops.length === 1 ? 'loop' : 'loops'}
          </Text>
        </View>
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            SUBTASKS
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

      <View style={styles.actions}>
        <Button
          label="Start a loop"
          onPress={() =>
            router.push({
              pathname: '/loop/start',
              params: { taskId: task.id },
            })
          }
          style={styles.action}
        />
        <Button
          label={completed ? 'Reopen' : 'Complete'}
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
          label="Add subtask"
          variant="secondary"
          onPress={() => setAddSubtaskVisible(true)}
          style={styles.action}
        />
        <Button
          label="Archive"
          variant="ghost"
          onPress={() => setArchiveVisible(true)}
          style={styles.action}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Subtasks</Text>
        {subtreeRows.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            No subtasks yet.
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
                onToggleComplete={() => {
                  void setTaskStatus(
                    db,
                    row.task.id,
                    row.task.status === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED'
                  ).then(reload);
                }}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Loop history</Text>
        {loops.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            No loops have been attached to this task yet.
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
        heading="Edit task"
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
        heading="New subtask"
        parentTitle={task.title}
        busy={saving}
        onSave={(values) => {
          void handleAddSubtask(values);
        }}
        onClose={() => setAddSubtaskVisible(false)}
      />

      <ConfirmDialog
        visible={archiveVisible}
        title="Archive task?"
        message="The task and its subtasks will be hidden from the task pool. Existing loops stay in history."
        confirmLabel="Archive"
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
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
