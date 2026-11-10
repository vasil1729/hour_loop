import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Task } from '../../domain/types';
import { flattenTree, type FlatTaskNode } from '../../domain/tasks/taskDomain';
import { spacing } from '../../theme/tokens';
import { TaskRow } from './TaskRow';

type TaskTreeProps = {
  tasks: Task[];
  expandedIds: ReadonlySet<string>;
  onToggleExpand: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onToggleComplete?: (task: Task) => void;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function TaskTree({
  tasks,
  expandedIds,
  onToggleExpand,
  onOpenTask,
  onToggleComplete,
  ListHeaderComponent,
  ListEmptyComponent,
  contentContainerStyle,
}: TaskTreeProps) {
  const rows = useMemo(() => flattenTree(tasks, expandedIds), [tasks, expandedIds]);

  return (
    <FlatList<FlatTaskNode>
      data={rows}
      keyExtractor={(row) => row.task.id}
      renderItem={({ item }) => (
        <TaskRow
          task={item.task}
          depth={item.depth}
          hasChildren={item.hasChildren}
          isExpanded={item.isExpanded}
          onToggleExpand={() => onToggleExpand(item.task.id)}
          onPress={() => onOpenTask(item.task.id)}
          onToggleComplete={
            onToggleComplete ? () => onToggleComplete(item.task) : undefined
          }
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.sm,
  },
});
