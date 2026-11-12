import React, { Suspense, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import * as SystemUI from 'expo-system-ui';
import { SystemBars } from 'react-native-edge-to-edge';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseErrorBoundary } from '../src/components/common/DatabaseErrorBoundary';
import { LoadingScreen } from '../src/components/common/LoadingScreen';
import { useTargetGuard } from '../src/hooks/useTargetGuard';
import { WebPhoneFrame } from '../src/components/common/WebPhoneFrame';
import { DATABASE_NAME } from '../src/database/client';
import { migrateDbIfNeeded } from '../src/database/migrations';
import { loopService } from '../src/features/loops/loopService';
import { I18nProvider, useTranslation } from '../src/i18n/I18nProvider';
import { recoverAppState, subscribeToForeground } from '../src/services/lifecycle/appLifecycleService';
import { setupNotifications } from '../src/services/notifications/notificationService';
import { useSettingsStore } from '../src/store/settingsStore';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  useTargetGuard(db);
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

function NotificationResponseHandler() {
  const db = useSQLiteContext();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;
    let startTimeout: ReturnType<typeof setTimeout> | null = null;
    const handled = new Set<string>();

    const handleResponse = async (
      response: Notifications.NotificationResponse | null
    ) => {
      if (!response || !active) return;

      const request = response.notification.request;
      const key = `${request.identifier}:${response.actionIdentifier}`;
      if (handled.has(key)) return;
      handled.add(key);

      const loopId = request.content.data?.loopId;
      if (typeof loopId !== 'string') return;

      try {
        const loop = await loopService.getLoop(db, loopId);
        if (!active) return;
        if (loop.status === 'ACTIVE' || loop.status === 'PAUSED') {
          router.navigate('/loop/active');
        } else {
          router.navigate({
            pathname: '/loop/[id]',
            params: { id: loopId },
          });
        }
      } catch {
        // The loop may have been deleted after the notification was scheduled.
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void handleResponse(response).finally(() => {
          void Notifications.clearLastNotificationResponseAsync().catch(
            () => undefined
          );
        });
      }
    );

    // A tap that cold-starts the app is not emitted through the listener, so
    // consume the stored response once the navigator has mounted.
    startTimeout = setTimeout(() => {
      void Notifications.getLastNotificationResponseAsync()
        .then(async (response) => {
          if (!response) return;
          await handleResponse(response);
          await Notifications.clearLastNotificationResponseAsync();
        })
        .catch(() => undefined);
    }, 0);

    return () => {
      active = false;
      if (startTimeout) clearTimeout(startTimeout);
      subscription.remove();
    };
  }, [db, router]);

  return null;
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
          <Stack.Screen name="day/[date]" />
          <Stack.Screen name="assistant/index" />
        </Stack>
        <NotificationResponseHandler />
      </View>
    </>
  );
}

function DatabaseLoadingScreen() {
  const { t } = useTranslation();
  return <LoadingScreen message={t('app.openingDatabase')} />;
}

export default function RootLayout() {
  return (
    <WebPhoneFrame>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <DatabaseErrorBoundary>
              <Suspense fallback={<DatabaseLoadingScreen />}>
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
            </DatabaseErrorBoundary>
          </I18nProvider>
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
