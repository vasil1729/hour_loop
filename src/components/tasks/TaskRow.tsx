import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Task } from '../../domain/types';
import { useTranslation } from '../../i18n/I18nProvider';
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
  const { t, isRTL } = useTranslation();
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
      accessibilityLabel={
        completed
          ? t('taskRow.completedA11y', { title: task.title })
          : task.title
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          marginStart: depth * spacing.lg,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      {showChevron ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isExpanded ? t('taskRow.collapse') : t('taskRow.expand')
          }
          onPress={onToggleExpand}
          hitSlop={8}
          style={styles.chevron}
        >
          {hasChildren ? (
            <Ionicons
              name={isExpanded ? 'chevron-down' : isRTL ? 'chevron-back' : 'chevron-forward'}
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
        accessibilityLabel={t('taskRow.markComplete', { title: task.title })}
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
          <Text style={[styles.meta, { color: colors.warning }]}>
            {t('taskRow.inProgress')}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name={isRTL ? 'chevron-back' : 'chevron-forward'}
        size={16}
        color={colors.textSecondary}
        style={styles.trailing}
      />
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
    minWidth: 0,
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
  trailing: {
    flexShrink: 0,
  },
});
