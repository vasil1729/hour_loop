import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ASSISTANT_MAX_MESSAGE_LENGTH } from '../../constants/assistant';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type ChatComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
};

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onStop,
  busy,
  disabled = false,
}: ChatComposerProps) {
  const { colors } = useTheme();
  const { t, isRTL } = useTranslation();
  const canSend = value.trim().length > 0 && !busy && !disabled;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={t('assistant.placeholder')}
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={ASSISTANT_MAX_MESSAGE_LENGTH}
        editable={!disabled}
        textAlign={isRTL ? 'right' : 'left'}
        accessibilityLabel={t('assistant.composerA11y')}
        style={[styles.input, { color: colors.text }]}
      />
      {busy ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.stopA11y')}
          onPress={onStop}
          hitSlop={8}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: colors.surfaceAlt,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="stop" size={18} color={colors.danger} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.send')}
          accessibilityState={{ disabled: !canSend }}
          onPress={onSend}
          disabled={!canSend}
          hitSlop={8}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: colors.accent,
              opacity: !canSend ? 0.4 : pressed ? 0.75 : 1,
            },
          ]}
        >
          <Ionicons
            name={isRTL ? 'arrow-back' : 'arrow-forward'}
            size={18}
            color="#FFFFFF"
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
