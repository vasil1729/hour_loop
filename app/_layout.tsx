import React from 'react';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME } from '../src/database/client';
import { migrateDbIfNeeded } from '../src/database/migrations';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

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
          <RootNavigator />
        </SQLiteProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
