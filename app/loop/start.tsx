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
import { Screen } from '../../src/components/common/Screen';
import { TaskPicker } from '../../src/components/tasks/TaskPicker';
import {
  DURATION_PRESETS_MINUTES,
  minutesToSeconds,
  secondsToMinutes,
} from '../../src/constants/durationPresets';
import type { Task } from '../../src/domain/types';
import { loopService } from '../../src/features/loops/loopService';
import { syncLoopNotification } from '../../src/services/notifications/notificationService';
import {
  getSuggestedCarryIn,
  listTasks,
  markTaskInProgress,
} from '../../src/features/tasks/taskService';
import { useLoopStore } from '../../src/store/loopStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function StartLoopScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string }>();
  const { colors } = useTheme();
  const refreshLoop = useLoopStore((state) => state.refresh);
  const defaultDurationSeconds = useSettingsStore(
    (state) => state.defaultDurationSeconds
  );

  const [focus, setFocus] = useState('');
  const [carryIn, setCarryIn] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    typeof params.taskId === 'string' ? params.taskId : null
  );
  const [taskPickerVisible, setTaskPickerVisible] = useState(false);
  const [suggestedCarryIn, setSuggestedCarryIn] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(defaultDurationSeconds);
  const [customMinutes, setCustomMinutes] = useState('');
  const [durationTouched, setDurationTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!durationTouched) {
      setDurationSeconds(defaultDurationSeconds);
    }
  }, [defaultDurationSeconds, durationTouched]);

  useEffect(() => {
    let cancelled = false;
    void listTasks(db, 'active').then((result) => {
      if (!cancelled) setTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTaskId) {
      setSuggestedCarryIn(null);
      return;
    }
    void getSuggestedCarryIn(db, selectedTaskId).then((suggestion) => {
      if (!cancelled) {
        setSuggestedCarryIn(suggestion);
        if (suggestion && !carryIn.trim()) {
          setCarryIn(suggestion);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // carryIn is intentionally read once per task selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, selectedTaskId]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const selectDuration = (seconds: number) => {
    setDurationTouched(true);
    setDurationSeconds(seconds);
    if (!DURATION_PRESETS_MINUTES.some((minutes) => minutesToSeconds(minutes) === seconds)) {
      setCustomMinutes(String(secondsToMinutes(seconds)));
    }
  };

  const handleCustomMinutesChange = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    setCustomMinutes(digits);
    setDurationTouched(true);
    const minutes = Number(digits);
    if (Number.isFinite(minutes) && minutes > 0) {
      setDurationSeconds(minutesToSeconds(minutes));
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      const loop = await loopService.startLoop(db, {
        focus,
        carryIn,
        taskId: selectedTaskId,
        targetDurationSeconds: durationSeconds,
      });
      await syncLoopNotification(db, loop, { requestPermission: true }).catch(
        () => undefined
      );
      if (selectedTaskId) {
        await markTaskInProgress(db, selectedTaskId).catch(() => undefined);
      }
      await refreshLoop(db);
      router.replace('/loop/active');
    } catch (error) {
      Alert.alert(
        'Could not start loop',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={[styles.cancel, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Start a loop</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>FOCUS</Text>
        <TextInput
          value={focus}
          onChangeText={setFocus}
          placeholder="What is this loop for?"
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          multiline
          maxLength={280}
          autoFocus
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>CARRY IN</Text>
        <TextInput
          value={carryIn}
          onChangeText={setCarryIn}
          placeholder="Anything to remember from before?"
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          multiline
          maxLength={280}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>TASK (OPTIONAL)</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a task for this loop"
          onPress={() => setTaskPickerVisible(true)}
          style={[
            styles.taskSelector,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.taskSelectorText,
              { color: selectedTask ? colors.text : colors.textSecondary },
            ]}
          >
            {selectedTask ? selectedTask.title : 'No task selected'}
          </Text>
          <Text style={[styles.taskSelectorAction, { color: colors.accent }]}>
            {selectedTask ? 'Change' : 'Choose'}
          </Text>
        </Pressable>
        {suggestedCarryIn && !carryIn.trim() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use suggested carry in"
            onPress={() => setCarryIn(suggestedCarryIn)}
          >
            <Text style={[styles.suggestion, { color: colors.accent }]}>
              Use previous roll forward: {suggestedCarryIn}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>TARGET</Text>
        <View style={styles.chips}>
          {DURATION_PRESETS_MINUTES.map((minutes) => {
            const seconds = minutesToSeconds(minutes);
            const selected = durationSeconds === seconds && !customMinutes;
            return (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  selectDuration(seconds);
                  setCustomMinutes('');
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {minutes}m
                </Text>
              </Pressable>
            );
          })}
          <View
            style={[
              styles.customChip,
              {
                backgroundColor: colors.surface,
                borderColor: customMinutes ? colors.accent : colors.border,
              },
            ]}
          >
            <TextInput
              value={customMinutes}
              onChangeText={handleCustomMinutesChange}
              placeholder="Custom"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              style={[styles.customInput, { color: colors.text }]}
              maxLength={4}
            />
            <Text style={[styles.customSuffix, { color: colors.textSecondary }]}>
              min
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.summary}>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
          This loop will run for
        </Text>
        <Text style={[styles.summaryValue, { color: colors.text }]}>
          {secondsToMinutes(durationSeconds)} minutes
        </Text>
      </View>

      <TaskPicker
        visible={taskPickerVisible}
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        onSelect={(taskId) => {
          setSelectedTaskId(taskId);
          setTaskPickerVisible(false);
        }}
        onClose={() => setTaskPickerVisible(false)}
      />

      <Button
        label="Start loop"
        onPress={() => {
          void handleStart();
        }}
        loading={busy}
        disabled={durationSeconds <= 0}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancel: {
    fontSize: 15,
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 44,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    minWidth: 64,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 132,
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  customInput: {
    flex: 1,
    minWidth: 58,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '600',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  customSuffix: {
    fontSize: 12,
    lineHeight: 16,
    marginLeft: spacing.xs,
    alignSelf: 'center',
  },
  taskSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
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
  suggestion: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  summary: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    fontSize: 13,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '700',
  },
});
