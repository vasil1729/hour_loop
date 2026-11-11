import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { minutesToSeconds, secondsToMinutes } from '../../constants/durationPresets';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';
import { Button } from '../common/Button';

type IntentionEditModalProps = {
  visible: boolean;
  title: string;
  initialSeconds: number | null;
  presetMinutes: number[];
  busy?: boolean;
  onSave: (seconds: number) => void;
  onClear: () => void;
  onClose: () => void;
};

export function IntentionEditModal({
  visible,
  title,
  initialSeconds,
  presetMinutes,
  busy = false,
  onSave,
  onClear,
  onClose,
}: IntentionEditModalProps) {
  const { colors } = useTheme();
  const [seconds, setSeconds] = useState(initialSeconds ?? 0);
  const [customMinutes, setCustomMinutes] = useState(
    initialSeconds ? String(secondsToMinutes(initialSeconds)) : ''
  );

  useEffect(() => {
    if (!visible) return;
    setSeconds(initialSeconds ?? 0);
    setCustomMinutes(initialSeconds ? String(secondsToMinutes(initialSeconds)) : '');
  }, [initialSeconds, visible]);

  const selectMinutes = (minutes: number) => {
    setSeconds(minutesToSeconds(minutes));
    setCustomMinutes(String(minutes));
  };

  const handleCustom = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    setCustomMinutes(digits);
    const minutes = Number(digits);
    setSeconds(Number.isFinite(minutes) && minutes > 0 ? minutesToSeconds(minutes) : 0);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={10}
            >
              <Text style={[styles.close, { color: colors.textSecondary }]}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.chips}>
            {presetMinutes.map((minutes) => {
              const selected = seconds === minutesToSeconds(minutes);
              return (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectMinutes(minutes)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.accent : colors.background,
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
                    {minutes >= 60
                      ? `${Math.round((minutes / 60) * 10) / 10}h`
                      : `${minutes}m`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customRow}>
            <TextInput
              value={customMinutes}
              onChangeText={handleCustom}
              placeholder="Custom minutes"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={5}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            />
            <Text style={[styles.suffix, { color: colors.textSecondary }]}>min</Text>
          </View>

          <View style={styles.actions}>
            <Button
              label="Clear"
              variant="ghost"
              onPress={onClear}
              disabled={busy || !initialSeconds}
              style={styles.action}
            />
            <Button
              label="Save"
              onPress={() => onSave(seconds)}
              loading={busy}
              disabled={seconds <= 0}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  close: {
    fontSize: 13,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minWidth: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  suffix: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
