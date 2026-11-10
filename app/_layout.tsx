import React, { Suspense, useEffect } from 'react';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingScreen } from '../src/components/common/LoadingScreen';
import { DATABASE_NAME } from '../src/database/client';
import { migrateDbIfNeeded } from '../src/database/migrations';
import { recoverAppState, subscribeToForeground } from '../src/services/lifecycle/appLifecycleService';
import { setupNotifications } from '../src/services/notifications/notificationService';
import { useSettingsStore } from '../src/store/settingsStore';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const loadSettings = useSettingsStore((state) => state.load);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadSettings(db);
      if (!cancelled) {
        await recoverAppState(db);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, loadSettings]);

  useEffect(() => {
    void setupNotifications();
    const subscription = subscribeToForeground(db);
    return () => subscription.remove();
  }, [db]);

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
        <Suspense fallback={<LoadingScreen message="Opening your local database…" />}>
          <SQLiteProvider
            databaseName={DATABASE_NAME}
            onInit={migrateDbIfNeeded}
            useSuspense
          >
            <AppBootstrap>
              <RootNavigator />
            </AppBootstrap>
          </SQLiteProvider>
        </Suspense>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
