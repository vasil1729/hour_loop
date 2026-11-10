import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../src/components/common/Screen';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing } from '../../src/theme/tokens';

export default function TasksScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>TASK POOL</Text>
        <Text style={[styles.title, { color: colors.text }]}>Tasks</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.4 },
  title: { fontSize: 26, fontWeight: '700' },
});
