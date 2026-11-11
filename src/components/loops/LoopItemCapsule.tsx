import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type LoopItemCapsuleProps = {
  text: string;
  done?: boolean;
  selected?: boolean;
  carried?: boolean;
  disabled?: boolean;
  pressAccessibilityLabel?: string;
  onPress?: () => void;
  onRemove?: () => void;
};

export function LoopItemCapsule({
  text,
  done = false,
  selected = false,
  carried = false,
  disabled = false,
  pressAccessibilityLabel,
  onPress,
  onRemove,
}: LoopItemCapsuleProps) {
  const { colors } = useTheme();

  const backgroundColor = selected
    ? colors.accentSoft
    : done
      ? colors.surfaceAlt
      : colors.surface;
  const borderColor = selected ? colors.accent : colors.border;
  const textColor = done ? colors.textSecondary : colors.text;
  const iconColor = done
    ? colors.success
    : selected || carried
      ? colors.accent
      : colors.textSecondary;

  const content = (
    <>
      {done ? (
        <Ionicons name="checkmark-circle" size={16} color={iconColor} />
      ) : carried ? (
        <Ionicons name="arrow-down-circle-outline" size={16} color={iconColor} />
      ) : null}
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            textDecorationLine: done ? 'line-through' : 'none',
          },
        ]}
      >
        {text}
      </Text>
    </>
  );

  return (
    <View
      style={[
        styles.capsule,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pressAccessibilityLabel ?? text}
          accessibilityState={{ selected, disabled }}
          disabled={disabled}
          onPress={onPress}
          style={styles.main}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.main}>{content}</View>
      )}

      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${text}`}
          hitSlop={8}
          onPress={onRemove}
          style={styles.remove}
        >
          <Ionicons name="close" size={14} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  text: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  remove: {
    padding: spacing.xs,
  },
});
