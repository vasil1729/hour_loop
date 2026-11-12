import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, lineHeight, radius, spacing } from '../../theme/tokens';
import { SuggestedPrompts } from './SuggestedPrompts';

type AssistantEmptyStateProps = {
  onSelectPrompt: (text: string) => void;
};

export function AssistantEmptyState({
  onSelectPrompt,
}: AssistantEmptyStateProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View
        style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}
      >
        <Ionicons name="sparkles" size={22} color={colors.accent} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>
        {t('assistant.emptyTitle')}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {t('assistant.emptyBody')}
      </Text>
      <SuggestedPrompts onSelect={onSelectPrompt} />
      <Text style={[styles.privacy, { color: colors.textSecondary }]}>
        {t('assistant.privacyNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.body,
  },
  privacy: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
});
