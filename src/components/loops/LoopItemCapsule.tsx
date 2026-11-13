import React, { useEffect, useMemo, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type LoopItemCapsuleProps = {
  text: string;
  done?: boolean;
  current?: boolean;
  selected?: boolean;
  carried?: boolean;
  disabled?: boolean;
  paused?: boolean;
  shakeSignal?: number;
  pressAccessibilityLabel?: string;
  onPress?: () => void;
  onToggleDone?: () => void;
  onTogglePause?: () => void;
  onSwipeDone?: () => void;
  onSwipeUndone?: () => void;
  onRemove?: () => void;
};

const SWIPE_THRESHOLD = 56;

export function LoopItemCapsule({
  text,
  done = false,
  current = false,
  selected = false,
  carried = false,
  disabled = false,
  paused = false,
  shakeSignal = 0,
  pressAccessibilityLabel,
  onPress,
  onToggleDone,
  onTogglePause,
  onSwipeDone,
  onSwipeUndone,
  onRemove,
}: LoopItemCapsuleProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeEnabled = Boolean(onSwipeDone || onSwipeUndone);

  useEffect(() => {
    if (!shakeSignal) return;
    translateX.stopAnimation();
    translateX.setValue(0);
    Animated.sequence([
      Animated.timing(translateX, {
        toValue: -8,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 8,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: -6,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 6,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 45,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeSignal, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          swipeEnabled &&
          Math.abs(gesture.dx) > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          swipeEnabled &&
          Math.abs(gesture.dx) > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          if (!swipeEnabled) return;
          translateX.setValue(Math.max(-96, Math.min(96, gesture.dx)));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            onSwipeDone?.();
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            onSwipeUndone?.();
          }
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            useNativeDriver: true,
          }).start();
        },
      }),
    [onSwipeDone, onSwipeUndone, swipeEnabled, translateX]
  );

  const backgroundColor =
    current || selected
      ? colors.accentSoft
      : done
        ? colors.surfaceAlt
        : colors.surface;
  const borderColor = current || selected ? colors.accent : colors.border;
  const textColor = done ? colors.textSecondary : colors.text;
  const carriedOrDoneIcon = done
    ? colors.success
    : carried
      ? colors.accent
      : colors.textSecondary;

  return (
    <Animated.View
      {...(swipeEnabled ? panResponder.panHandlers : {})}
      style={[
        styles.capsule,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.5 : 1,
          transform: [{ translateX }],
        },
      ]}
    >
      {onToggleDone ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled }}
          accessibilityLabel={t(
            done ? 'loopItem.markNotDone' : 'loopItem.markDone',
            { text }
          )}
          disabled={disabled}
          hitSlop={8}
          onPress={onToggleDone}
          style={styles.status}
        >
          <Ionicons
            name={
              done
                ? 'checkmark-circle'
                : current
                  ? 'play-circle'
                  : 'ellipse-outline'
            }
            size={18}
            color={
              done
                ? colors.success
                : current
                  ? colors.accent
                  : colors.textSecondary
            }
          />
        </Pressable>
      ) : null}

      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            pressAccessibilityLabel ??
            (current
              ? t('loopItem.currentFocusA11y', { text })
              : t('loopItem.focusA11y', { text }))
          }
          accessibilityState={{ selected: current || selected, disabled }}
          disabled={disabled || done}
          onPress={onPress}
          style={styles.main}
        >
          {!onToggleDone && (done || carried) ? (
            <Ionicons
              name={done ? 'checkmark-circle' : 'arrow-down-circle-outline'}
              size={16}
              color={carriedOrDoneIcon}
            />
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
        </Pressable>
      ) : (
        <View style={styles.main}>
          {!onToggleDone && (done || carried) ? (
            <Ionicons
              name={done ? 'checkmark-circle' : 'arrow-down-circle-outline'}
              size={16}
              color={carriedOrDoneIcon}
            />
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
        </View>
      )}

      {onTogglePause ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t(
            paused ? 'loopControls.resume' : 'loopControls.pause'
          )} ${text}`}
          disabled={disabled}
          hitSlop={8}
          onPress={onTogglePause}
          style={styles.pause}
        >
          <Ionicons
            name={paused ? 'play' : 'pause'}
            size={14}
            color={colors.accent}
          />
        </Pressable>
      ) : null}

      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('loopItem.removeA11y', { text })}
          hitSlop={8}
          onPress={onRemove}
          style={styles.remove}
        >
          <Ionicons name="close" size={14} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </Animated.View>
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
    paddingStart: spacing.md,
    paddingEnd: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  status: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.xs,
    paddingEnd: spacing.xs,
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
  pause: {
    padding: spacing.xs,
  },
});
