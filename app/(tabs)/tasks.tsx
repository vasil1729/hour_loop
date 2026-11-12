import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { LoopItemCapsule } from '../../src/components/loops/LoopItemCapsule';
import { TaskFormModal } from '../../src/components/tasks/TaskFormModal';
import { TaskTree } from '../../src/components/tasks/TaskTree';
import type { Capsule } from '../../src/domain/capsules/capsuleDomain';
import type { Task } from '../../src/domain/types';
import {
  listLooseCapsules,
  setCapsuleDone,
} from '../../src/features/capsules/capsuleService';
import {
  createTask,
  listTasks,
  setTaskStatus,
  type TaskFilter,
} from '../../src/features/tasks/taskService';
import { localizeError } from '../../src/i18n';
import { useTranslation } from '../../src/i18n/I18nProvider';
import type { TranslationKey } from '../../src/i18n/types';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

const FILTERS: { key: TaskFilter; labelKey: TranslationKey }[] = [
  { key: 'active', labelKey: 'tasks.filterActive' },
  { key: 'completed', labelKey: 'tasks.filterCompleted' },
  { key: 'all', labelKey: 'tasks.filterAll' },
];

export default function TasksScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [filter, setFilter] = useState<TaskFilter>('active');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [looseCapsules, setLooseCapsules] = useState<Capsule[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [addVisible, setAddVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [result, capsules] = await Promise.all([
      listTasks(db, filter),
      listLooseCapsules(db),
    ]);
    setTasks(result);
    setLooseCapsules(capsules);
    setLoading(false);
  }, [db, filter]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void Promise.all([listTasks(db, filter), listLooseCapsules(db)]).then(
        ([result, capsules]) => {
          if (!cancelled) {
            setTasks(result);
            setLooseCapsules(capsules);
            setLoading(false);
          }
        }
      );
      return () => {
        cancelled = true;
      };
    }, [db, filter])
  );

  const toggleExpand = (taskId: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleComplete = async (task: Task) => {
    try {
      await setTaskStatus(
        db,
        task.id,
        task.status === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED'
      );
      await reload();
    } catch (error) {
      Alert.alert(
        t('tasks.couldNotUpdateTask'),
        localizeError(error)
      );
    }
  };

  const completeCapsule = async (capsule: Capsule) => {
    try {
      await setCapsuleDone(db, capsule, true);
      await reload();
    } catch (error) {
      Alert.alert(
        t('tasks.couldNotUpdateCapsule'),
        localizeError(error)
      );
    }
  };

  const handleAddTask = async (values: { title: string; description: string }) => {
    setSaving(true);
    try {
      await createTask(db, {
        title: values.title,
        description: values.description,
      });
      setAddVisible(false);
      await reload();
    } catch (error) {
      Alert.alert(
        t('tasks.couldNotAddTask'),
        localizeError(error)
      );
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
            {t('tasks.eyebrow')}
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('tasks.title')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasks.addTaskA11y')}
          onPress={() => setAddVisible(true)}
          style={[styles.addButton, { backgroundColor: colors.accent }]}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((entry) => {
          const selected = entry.key === filter;
          return (
            <Pressable
              key={entry.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFilter(entry.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: selected ? colors.accent : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: selected ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                {t(entry.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {looseCapsules.length > 0 ? (
        <View style={styles.capsuleSection}>
          <View style={styles.capsuleHeader}>
            <Text style={[styles.capsuleLabel, { color: colors.textSecondary }]}>
              {t('tasks.looseCapsules')}
            </Text>
            <Text style={[styles.capsuleCount, { color: colors.textSecondary }]}>
              {t('common.openCount', { count: looseCapsules.length })}
            </Text>
          </View>
          <View style={styles.capsuleWrap}>
            {looseCapsules.map((capsule) => (
              <LoopItemCapsule
                key={capsule.item.id}
                text={capsule.item.text}
                pressAccessibilityLabel={t('tasks.completeCapsuleA11y', {
                  text: capsule.item.text,
                })}
                onPress={() => {
                  void completeCapsule(capsule);
                }}
              />
            ))}
          </View>
          <Text style={[styles.capsuleHint, { color: colors.textSecondary }]}>
            {t('tasks.looseHint')}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false}>
      {loading ? (
        <LoadingScreen />
      ) : (
        <TaskTree
          tasks={tasks}
          expandedIds={expandedIds}
          onToggleExpand={toggleExpand}
          onOpenTask={(taskId) => router.push(`/task/${taskId}`)}
          onToggleComplete={(task) => {
            void toggleComplete(task);
          }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              <EmptyState
                title={
                  filter === 'completed'
                    ? t('tasks.noCompletedTitle')
                    : t('tasks.noTasksTitle')
                }
                message={
                  filter === 'completed'
                    ? t('tasks.noCompletedMessage')
                    : looseCapsules.length > 0
                      ? t('tasks.noTasksLooseMessage')
                      : t('tasks.noTasksMessage')
                }
              />
            </View>
          }
        />
      )}

      <TaskFormModal
        visible={addVisible}
        heading={t('tasks.newTask')}
        busy={saving}
        onSave={(values) => {
          void handleAddTask(values);
        }}
        onClose={() => setAddVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  capsuleSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  capsuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  capsuleLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  capsuleCount: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  capsuleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  capsuleHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  empty: {
    minHeight: 300,
  },
});
