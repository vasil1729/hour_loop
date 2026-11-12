import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AssistantChatMessage } from '../../features/assistant/assistantTypes';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, lineHeight, radius, spacing } from '../../theme/tokens';

type ChatMessageProps = {
  message: AssistantChatMessage;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';

  return (
    <View
      style={[styles.row, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}
      accessibilityLabel={`${isUser ? t('assistant.you') : t('assistant.assistant')}: ${message.content}`}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.accent : colors.surface,
            borderColor: isError ? colors.danger : colors.border,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {!isUser ? (
          <View style={styles.roleRow}>
            <Ionicons name="sparkles" size={12} color={colors.accent} />
            <Text style={[styles.role, { color: colors.accent }]}>
              {t('assistant.assistant')}
            </Text>
          </View>
        ) : null}
        {message.content ? (
          <Text
            selectable
            style={[
              styles.content,
              { color: isUser ? '#FFFFFF' : colors.text },
            ]}
          >
            {message.content}
          </Text>
        ) : isStreaming ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.thinking, { color: colors.textSecondary }]}>
              {t('assistant.thinking')}
            </Text>
          </View>
        ) : null}
        {isError ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.errorHint, { color: colors.danger }]}
          >
            {t('assistant.errorHint')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  role: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  content: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.body,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thinking: {
    fontSize: fontSize.sm,
  },
  errorHint: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
