import React, { useMemo } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Task } from '../../domain/types';
import { flattenTree } from '../../domain/tasks/taskDomain';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type TaskPickerProps = {
  visible: boolean;
  tasks: Task[];
  selectedTaskId: string | null;
  title?: string;
  onSelect: (taskId: string | null) => void;
  onClose: () => void;
};

export function TaskPicker({
  visible,
  tasks,
  selectedTaskId,
  title = 'Choose a task',
  onSelect,
  onClose,
}: TaskPickerProps) {
  const { colors } = useTheme();
  const expanded = useMemo(
    () => new Set(tasks.map((task) => task.id)),
    [tasks]
  );
  const rows = useMemo(() => flattenTree(tasks, expanded), [tasks, expanded]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close task picker"
              onPress={onClose}
              hitSlop={10}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedTaskId === null }}
            onPress={() => onSelect(null)}
            style={[
              styles.noneRow,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Ionicons
              name={selectedTaskId === null ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={selectedTaskId === null ? colors.accent : colors.textSecondary}
            />
            <Text style={[styles.noneText, { color: colors.text }]}>No task</Text>
          </Pressable>

          <FlatList
            data={rows}
            keyExtractor={(row) => row.task.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const selected = selectedTaskId === item.task.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item.task.id)}
                  style={[
                    styles.taskRow,
                    {
                      backgroundColor: selected ? colors.accentSoft : colors.surface,
                      marginLeft: item.depth * spacing.lg,
                    },
                  ]}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? colors.accent : colors.textSecondary}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.taskTitle, { color: colors.text }]}
                  >
                    {item.task.title}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  noneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noneText: {
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  taskTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
