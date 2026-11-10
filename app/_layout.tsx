import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME } from '../src/database/client';
import { migrateDbIfNeeded } from '../src/database/migrations';
import { useSettingsStore } from '../src/store/settingsStore';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const loadSettings = useSettingsStore((state) => state.load);

  useEffect(() => {
    void loadSettings(db);
  }, [db, loadSettings]);

  return <>{children}</>;
}

function RootNavigator() {
  const { colors, scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="loop/start"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen name="loop/active" options={{ gestureEnabled: false }} />
        <Stack.Screen name="loop/complete" options={{ gestureEnabled: false }} />
        <Stack.Screen name="loop/[id]" />
        <Stack.Screen name="task/[id]" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
          <AppBootstrap>
            <RootNavigator />
          </AppBootstrap>
        </SQLiteProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
