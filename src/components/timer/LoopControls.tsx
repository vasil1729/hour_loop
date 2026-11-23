import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type LoopControlsProps = {
  status: 'ACTIVE' | 'PAUSED';
  targetReached?: boolean;
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function LoopControls({
  status,
  targetReached = false,
  busy = false,
  onPause,
  onResume,
  onStop,
}: LoopControlsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const primaryLabel = targetReached
    ? t('loopControls.close')
    : status === 'ACTIVE'
      ? t('loopControls.pause')
      : t('loopControls.resume');
  const primaryIcon = targetReached
    ? 'checkmark'
    : status === 'ACTIVE'
      ? 'pause'
      : 'play';

  return (
    <View style={styles.row}>
      {!targetReached ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          disabled={busy}
          onPress={status === 'ACTIVE' ? onPause : onResume}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: busy ? 0.45 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name={primaryIcon} size={20} color={colors.accent} />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          targetReached ? t('loopControls.close') : t('loopControls.stop')
        }
        disabled={busy}
        onPress={onStop}
        hitSlop={8}
        style={({ pressed }) => [
          styles.iconButton,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: busy ? 0.45 : pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name={targetReached ? 'checkmark' : 'stop'}
          size={20}
          color={targetReached ? colors.success : colors.danger}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
