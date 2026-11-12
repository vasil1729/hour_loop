import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { Screen } from '../../src/components/common/Screen';
import { LoopItemCapsule } from '../../src/components/loops/LoopItemCapsule';
import { TaskPicker } from '../../src/components/tasks/TaskPicker';
import {
  DURATION_PRESETS_MINUTES,
  minutesToSeconds,
  secondsToMinutes,
} from '../../src/constants/durationPresets';
import type { Capsule } from '../../src/domain/capsules/capsuleDomain';
import { createId } from '../../src/domain/shared/id';
import { isLoopTarget } from '../../src/domain/tasks/taskDomain';
import type { Loop, LoopItem, Task } from '../../src/domain/types';
import { listLooseCapsules } from '../../src/features/capsules/capsuleService';
import { loopService } from '../../src/features/loops/loopService';
import { localizeError } from '../../src/i18n';
import { useTranslation } from '../../src/i18n/I18nProvider';
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

type DraftCapsule = {
  key: string;
  text: string;
  carriedFromItemId: string | null;
};

type CarrySource = {
  loop: Loop;
  items: LoopItem[];
};

export default function StartLoopScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const refreshLoop = useLoopStore((state) => state.refresh);
  const defaultDurationSeconds = useSettingsStore(
    (state) => state.defaultDurationSeconds
  );

  const [capsuleItems, setCapsuleItems] = useState<DraftCapsule[]>([]);
  const [newCapsuleText, setNewCapsuleText] = useState('');
  const [carrySource, setCarrySource] = useState<CarrySource | null>(null);
  const [looseCapsules, setLooseCapsules] = useState<Capsule[]>([]);
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
    if (!selectedTaskId || tasks.length === 0) return;
    const selected = tasks.find((task) => task.id === selectedTaskId);
    if (!selected || !isLoopTarget(selected)) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    let cancelled = false;
    void loopService
      .getPreviousLoopWithItems(db)
      .then((result) => {
        if (!cancelled) setCarrySource(result);
      })
      .catch(() => {
        if (!cancelled) setCarrySource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    void listLooseCapsules(db)
      .then((result) => {
        if (!cancelled) setLooseCapsules(result);
      })
      .catch(() => {
        if (!cancelled) setLooseCapsules([]);
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
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, selectedTaskId]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTaskParent = selectedTask?.parent_task_id
    ? tasks.find((task) => task.id === selectedTask.parent_task_id) ?? null
    : null;
  const selectedTaskLabel = selectedTask
    ? selectedTaskParent
      ? `${selectedTaskParent.title} / ${selectedTask.title}`
      : selectedTask.title
    : t('loopStart.noTaskCapsule');
  const availableLooseCapsules = looseCapsules.filter(
    (capsule) => capsule.loop.id !== carrySource?.loop.id
  );

  const carriedIds = new Set(
    capsuleItems
      .map((item) => item.carriedFromItemId)
      .filter((id): id is string => id !== null)
  );

  const appendCapsule = (text: string, carriedFromItemId: string | null = null) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setCapsuleItems((previous) => [
      ...previous,
      { key: createId(), text: trimmed, carriedFromItemId },
    ]);
  };

  const addTypedCapsule = () => {
    const trimmed = newCapsuleText.trim();
    if (!trimmed) return;
    appendCapsule(trimmed);
    setNewCapsuleText('');
  };

  const removeCapsule = (key: string) => {
    setCapsuleItems((previous) => previous.filter((item) => item.key !== key));
  };

  const toggleCarryItem = (item: LoopItem) => {
    if (item.done) return;
    if (carriedIds.has(item.id)) {
      setCapsuleItems((previous) =>
        previous.filter((entry) => entry.carriedFromItemId !== item.id)
      );
      return;
    }
    appendCapsule(item.text, item.id);
  };

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
        taskId: selectedTaskId,
        targetDurationSeconds: durationSeconds,
        items: capsuleItems.map((item) => ({
          text: item.text,
          carriedFromItemId: item.carriedFromItemId,
        })),
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
      Alert.alert(t('loopStart.couldNotStart'), localizeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={[styles.cancel, { color: colors.textSecondary }]}>
            {t('common.cancel')}
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('loopStart.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t('loopStart.capsules')}
        </Text>
        {capsuleItems.length > 0 ? (
          <View style={styles.capsuleWrap}>
            {capsuleItems.map((item) => (
              <LoopItemCapsule
                key={item.key}
                text={item.text}
                carried={item.carriedFromItemId !== null}
                onRemove={() => removeCapsule(item.key)}
              />
            ))}
          </View>
        ) : (
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            {t('loopStart.capsulesHelper')}
          </Text>
        )}
        <View style={styles.addRow}>
          <TextInput
            value={newCapsuleText}
            onChangeText={setNewCapsuleText}
            placeholder={t('loopStart.addPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.addInput,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            returnKeyType="done"
            onSubmitEditing={addTypedCapsule}
            maxLength={120}
            autoFocus
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('loopStart.addA11y')}
            onPress={addTypedCapsule}
            disabled={!newCapsuleText.trim()}
            style={[
              styles.addButton,
              {
                backgroundColor: colors.accent,
                opacity: newCapsuleText.trim() ? 1 : 0.45,
              },
            ]}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {carrySource && carrySource.items.length > 0 ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('loopStart.carryInFrom', {
              sequence: carrySource.loop.sequence_number,
            })}
          </Text>
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            {carrySource.items.every((item) => item.done)
              ? t('loopStart.carryAllDone')
              : t('loopStart.carryHint')}
          </Text>
          <View style={styles.capsuleWrap}>
            {carrySource.items.map((item) => (
              <LoopItemCapsule
                key={item.id}
                text={item.text}
                done={item.done}
                selected={carriedIds.has(item.id)}
                disabled={item.done}
                onPress={() => toggleCarryItem(item)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t('loopStart.taskCapsule')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('loopStart.chooseTaskA11y')}
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
            {selectedTaskLabel}
          </Text>
          <Text style={[styles.taskSelectorAction, { color: colors.accent }]}>
            {selectedTask ? t('common.change') : t('common.choose')}
          </Text>
        </Pressable>
        <Text style={[styles.helper, { color: colors.textSecondary }]}>
          {selectedTask
            ? t('loopStart.taskCapsuleHint')
            : t('loopStart.noTaskCapsuleHint')}
        </Text>
        {suggestedCarryIn &&
        !capsuleItems.some((item) => item.text === suggestedCarryIn) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('loopStart.addSuggested')}
            onPress={() => {
              if (suggestedCarryIn) appendCapsule(suggestedCarryIn);
            }}
          >
            <Text style={[styles.suggestion, { color: colors.accent }]}>
              {t('loopStart.previousRollForward', {
                text: suggestedCarryIn,
              })}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {availableLooseCapsules.length > 0 ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('loopStart.looseCapsules')}
          </Text>
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            {t('loopStart.looseHint')}
          </Text>
          <View style={styles.capsuleWrap}>
            {availableLooseCapsules.map((capsule) => (
              <LoopItemCapsule
                key={capsule.item.id}
                text={capsule.item.text}
                selected={carriedIds.has(capsule.item.id)}
                onPress={() => toggleCarryItem(capsule.item)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t('loopStart.target')}
        </Text>
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
                  {minutes}
                  {t('duration.minuteShort')}
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
              placeholder={t('loopStart.custom')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              style={[styles.customInput, { color: colors.text }]}
              maxLength={4}
            />
            <Text style={[styles.customSuffix, { color: colors.textSecondary }]}>
              {t('loopStart.min')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.summary}>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
          {t('loopStart.willRun')}
        </Text>
        <Text style={[styles.summaryValue, { color: colors.text }]}>
          {t('loopStart.minutes', {
            count: secondsToMinutes(durationSeconds),
          })}
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
        label={t('loopStart.start')}
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
  capsuleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginStart: spacing.xs,
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
