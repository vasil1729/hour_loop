import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Task } from '../../domain/types';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type TaskRowProps = {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onPress: () => void;
  onToggleComplete?: () => void;
  showChevron?: boolean;
};

export function TaskRow({
  task,
  depth,
  hasChildren,
  isExpanded,
  onToggleExpand,
  onPress,
  onToggleComplete,
  showChevron = true,
}: TaskRowProps) {
  const { colors } = useTheme();
  const completed = task.status === 'COMPLETED';
  const inProgress = task.status === 'IN_PROGRESS';

  const statusColor = completed
    ? colors.success
    : inProgress
      ? colors.warning
      : colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}${completed ? ', completed' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          marginLeft: depth * spacing.lg,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      {showChevron ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? 'Collapse capsules' : 'Expand capsules'}
          onPress={onToggleExpand}
          hitSlop={8}
          style={styles.chevron}
        >
          {hasChildren ? (
            <Ionicons
              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.textSecondary}
            />
          ) : (
            <View style={styles.chevronSpacer} />
          )}
        </Pressable>
      ) : (
        <View style={styles.chevronSpacer} />
      )}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`Mark ${task.title} complete`}
        onPress={onToggleComplete}
        hitSlop={8}
        disabled={!onToggleComplete}
      >
        <Ionicons
          name={
            completed
              ? 'checkmark-circle'
              : inProgress
                ? 'ellipse'
                : 'ellipse-outline'
          }
          size={24}
          color={statusColor}
        />
      </Pressable>

      <View style={styles.body}>
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            {
              color: completed ? colors.textSecondary : colors.text,
              textDecorationLine: completed ? 'line-through' : 'none',
            },
          ]}
        >
          {task.title}
        </Text>
        {inProgress ? (
          <Text style={[styles.meta, { color: colors.warning }]}>In progress</Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  chevron: {
    width: 20,
    alignItems: 'center',
  },
  chevronSpacer: {
    width: 16,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
  },
});
