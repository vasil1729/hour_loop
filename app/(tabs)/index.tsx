import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../src/components/common/Screen';
import { formatDayLabel, currentDayKey } from '../../src/domain/shared/dateUtils';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing } from '../../src/theme/tokens';

export default function TodayScreen() {
  const { colors } = useTheme();
  const dayKey = currentDayKey();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>TODAY</Text>
        <Text style={[styles.title, { color: colors.text }]}>{formatDayLabel(dayKey)}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Hour Loop</Text>
        <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
          Your offline focus timer is getting set up.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.4 },
  title: { fontSize: 26, fontWeight: '700' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  cardBody: { fontSize: 14, lineHeight: 21 },
});
