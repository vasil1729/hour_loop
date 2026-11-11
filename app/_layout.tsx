import React, { Suspense, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import * as SystemUI from 'expo-system-ui';
import { SystemBars } from 'react-native-edge-to-edge';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingScreen } from '../src/components/common/LoadingScreen';
import { WebPhoneFrame } from '../src/components/common/WebPhoneFrame';
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

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  return (
    <>
      <SystemBars
        style={{
          statusBar: scheme === 'dark' ? 'light' : 'dark',
          navigationBar: scheme === 'dark' ? 'light' : 'dark',
        }}
      />
      <View style={[styles.root, { backgroundColor: colors.background }]}>
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
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <WebPhoneFrame>
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
    </WebPhoneFrame>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
