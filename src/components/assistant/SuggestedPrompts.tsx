import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/types';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, radius, spacing } from '../../theme/tokens';

const SUGGESTIONS: TranslationKey[] = [
  'assistant.suggestStats',
  'assistant.suggestActive',
  'assistant.suggestStart',
  'assistant.suggestTasks',
];

type SuggestedPromptsProps = {
  onSelect: (text: string) => void;
};

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.chips}>
      {SUGGESTIONS.map((key) => {
        const text = t(key);
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={text}
            onPress={() => onSelect(text)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
