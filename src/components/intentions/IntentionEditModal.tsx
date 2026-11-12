import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { minutesToSeconds, secondsToMinutes } from '../../constants/durationPresets';
import { formatIntentionDuration } from '../../domain/intentions/intentionsDomain';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';
import { Button } from '../common/Button';

type IntentionEditModalProps = {
  visible: boolean;
  title: string;
  initialSeconds: number;
  presetMinutes: readonly number[];
  busy?: boolean;
  clearDisabled?: boolean;
  clearLabel?: string;
  helperText?: string;
  onSave: (seconds: number) => void;
  onClear: () => void;
  onClose: () => void;
};

function presetLabel(
  minutes: number,
  t: (key: 'duration.minuteShort' | 'duration.hourShort') => string
): string {
  return minutes >= 60
    ? `${minutes / 60}${t('duration.hourShort')}`
    : `${minutes}${t('duration.minuteShort')}`;
}

export function IntentionEditModal({
  visible,
  title,
  initialSeconds,
  presetMinutes,
  busy = false,
  clearDisabled = false,
  clearLabel,
  helperText,
  onSave,
  onClear,
  onClose,
}: IntentionEditModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(Math.max(0, initialSeconds));
  const [customMinutes, setCustomMinutes] = useState(
    initialSeconds > 0 ? String(secondsToMinutes(initialSeconds)) : ''
  );
  const secondsRef = useRef(Math.max(0, initialSeconds));

  useEffect(() => {
    if (!visible) return;
    const next = Math.max(0, initialSeconds);
    secondsRef.current = next;
    setSeconds(next);
    setCustomMinutes(next > 0 ? String(secondsToMinutes(next)) : '');
  }, [initialSeconds, visible]);

  const addPreset = (minutes: number) => {
    const next = secondsRef.current + minutesToSeconds(minutes);
    secondsRef.current = next;
    setSeconds(next);
    setCustomMinutes(String(secondsToMinutes(next)));
  };

  const handleCustom = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    setCustomMinutes(digits);
    const minutes = Number(digits);
    const next =
      Number.isFinite(minutes) && minutes > 0 ? minutesToSeconds(minutes) : 0;
    secondsRef.current = next;
    setSeconds(next);
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
              accessibilityLabel={t('common.close')}
              onPress={onClose}
              hitSlop={10}
            >
              <Text style={[styles.close, { color: colors.textSecondary }]}>
                {t('common.close')}
              </Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.totalCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
              {t('intentionEdit.target')}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.totalValue, { color: colors.text }]}
            >
              {formatIntentionDuration(seconds)}
            </Text>
          </View>

          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            {helperText ?? t('intentionEdit.helper')}
          </Text>

          <View style={styles.chips}>
            {presetMinutes.map((minutes) => (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityLabel={t('intentionEdit.addPreset', {
                  value: presetLabel(minutes, t),
                })}
                onPress={() => addPreset(minutes)}
                disabled={busy}
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.accentSoft,
                    borderColor: colors.accent,
                    opacity: busy ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: colors.accent }]}>
                  +{presetLabel(minutes, t)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.customRow}>
            <TextInput
              value={customMinutes}
              onChangeText={handleCustom}
              placeholder={t('intentionEdit.placeholder')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={5}
              editable={!busy}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            />
            <Text style={[styles.suffix, { color: colors.textSecondary }]}>
              {t('intentionEdit.min')}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              label={clearLabel ?? t('common.clear')}
              variant="ghost"
              onPress={onClear}
              disabled={busy || clearDisabled}
              style={styles.action}
            />
            <Button
              label={t('common.save')}
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
  totalCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
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
    fontWeight: '700',
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
