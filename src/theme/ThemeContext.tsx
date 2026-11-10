import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSettingsStore } from '../store/settingsStore';
import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';
import type { ThemeColors } from './tokens';

type ThemeContextValue = {
  colors: ThemeColors;
  scheme: 'light' | 'dark';
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkTheme,
  scheme: 'dark',
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const preference = useSettingsStore((state) => state.themePreference);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme =
      preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;
    return {
      scheme,
      colors: scheme === 'light' ? lightTheme : darkTheme,
    };
  }, [preference, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
