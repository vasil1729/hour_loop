import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { Screen } from '../../src/components/common/Screen';
import {
  DURATION_PRESETS_MINUTES,
  minutesToSeconds,
  secondsToMinutes,
} from '../../src/constants/durationPresets';
import { loopService } from '../../src/features/loops/loopService';
import { useLoopStore } from '../../src/store/loopStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function StartLoopScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const refreshLoop = useLoopStore((state) => state.refresh);
  const defaultDurationSeconds = useSettingsStore(
    (state) => state.defaultDurationSeconds
  );

  const [focus, setFocus] = useState('');
  const [carryIn, setCarryIn] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(defaultDurationSeconds);
  const [customMinutes, setCustomMinutes] = useState('');
  const [durationTouched, setDurationTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!durationTouched) {
      setDurationSeconds(defaultDurationSeconds);
    }
  }, [defaultDurationSeconds, durationTouched]);

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
      await loopService.startLoop(db, {
        focus,
        carryIn,
        targetDurationSeconds: durationSeconds,
      });
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
            styles.singleLine,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          maxLength={280}
        />
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
  singleLine: {
    minHeight: 50,
    textAlignVertical: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    minWidth: 110,
  },
  customInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: spacing.sm,
  },
  customSuffix: {
    fontSize: 12,
    marginLeft: spacing.xs,
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
