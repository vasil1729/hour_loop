import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type ArchivedCapsuleRowProps = {
  text: string;
  meta?: string;
  disabled?: boolean;
  onDelete: () => void;
};

export function ArchivedCapsuleRow({
  text,
  meta,
  disabled = false,
  onDelete,
}: ArchivedCapsuleRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Ionicons name="archive-outline" size={16} color={colors.textSecondary} />
      <View style={styles.main}>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {text}
        </Text>
        {meta ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('archivedCapsule.deleteA11y', { text })}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.delete,
          { opacity: pressed ? 0.65 : 1 },
        ]}
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  delete: {
    padding: spacing.xs,
  },
});
