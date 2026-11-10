import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { Screen } from '../../src/components/common/Screen';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/ThemeContext';
import { spacing } from '../../src/theme/tokens';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const load = useSettingsStore((state) => state.load);
  const loaded = useSettingsStore((state) => state.loaded);

  useEffect(() => {
    void load(db);
  }, [db, load]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>PREFERENCES</Text>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {loaded ? 'Settings are stored locally on this device.' : 'Loading settings…'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.4 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21 },
});
