export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 6, md: 12, lg: 20, full: 9999 } as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 32,
  timer: 64,
} as const;

export const lineHeight = { body: 22, heading: 28 } as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  border: string;
  overlay: string;
};

export const palette: { dark: ThemeColors; light: ThemeColors } = {
  dark: {
    background: '#0F0F12',
    surface: '#1A1A20',
    surfaceAlt: '#222228',
    text: '#F0F0F5',
    textSecondary: '#888899',
    accent: '#7B6EF6',
    accentSoft: '#2D2A4A',
    success: '#4ADE80',
    warning: '#FACC15',
    danger: '#F87171',
    border: '#2A2A35',
    overlay: 'rgba(0, 0, 0, 0.65)',
  },
  light: {
    background: '#F8F8FB',
    surface: '#FFFFFF',
    surfaceAlt: '#F0F0F5',
    text: '#12121A',
    textSecondary: '#666677',
    accent: '#6356E8',
    accentSoft: '#EAE8FD',
    success: '#16A34A',
    warning: '#CA8A04',
    danger: '#DC2626',
    border: '#E4E4EE',
    overlay: 'rgba(18, 18, 26, 0.45)',
  },
};
