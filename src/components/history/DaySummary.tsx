import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatIntentionDuration } from '../../domain/intentions/intentionsDomain';
import { formatDurationCompact } from '../../domain/timer/timerEngine';
import type { IntentionSummary } from '../../features/intentions/intentionsService';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type DaySummaryProps = {
  totalSeconds: number;
  loopCount: number;
  daily: IntentionSummary;
  title?: string;
  onPress?: () => void;
};

export function DaySummary({
  totalSeconds,
  loopCount,
  daily,
  title,
  onPress,
}: DaySummaryProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const hasIntention = daily.targetSeconds > 0;
  const percent = daily.progress.percent;

  const body = (
    <>
      {title ? (
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textSecondary }]}>
            {title}
          </Text>
          {onPress ? (
            <Ionicons
              name="chevron-forward"
              size={14}
              color={colors.accent}
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatDurationCompact(totalSeconds)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            {t('daySummary.focused')}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{loopCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            {loopCount === 1 ? t('daySummary.loop') : t('daySummary.loops')}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text
            style={[
              styles.statValue,
              { color: daily.progress.reached ? colors.success : colors.accent },
            ]}
          >
            {hasIntention ? `${percent}%` : '—'}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            {t('daySummary.ofIntention')}
          </Text>
        </View>
      </View>

      {hasIntention ? (
        <>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${percent}%`,
                  backgroundColor: daily.progress.reached
                    ? colors.success
                    : colors.accent,
                },
              ]}
            />
          </View>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {daily.isDefault ? t('daySummary.defaultPrefix') : ''}
            {t('daySummary.intended', {
              actual: formatIntentionDuration(daily.actualSeconds),
              target: formatIntentionDuration(daily.targetSeconds),
            })}
          </Text>
        </>
      ) : (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {t('daySummary.noIntention')}
        </Text>
      )}
    </>
  );

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.border },
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        style={({ pressed }) => [
          ...cardStyle,
          pressed ? styles.pressed : null,
        ]}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
  meta: {
    fontSize: 12,
  },
});
