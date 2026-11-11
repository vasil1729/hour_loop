import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const MIN_DESKTOP_WIDTH = 600;
const MIN_DESKTOP_HEIGHT = 700;

type WebPhoneFrameProps = {
  children: React.ReactNode;
};

/**
 * Dev-only helper for the web preview: centers the app inside a phone-shaped
 * frame when the browser window is desktop-sized. On phones, tablets and
 * native builds it renders its children unchanged.
 */
export function WebPhoneFrame({ children }: WebPhoneFrameProps) {
  const { width, height } = useWindowDimensions();
  const showFrame =
    Platform.OS === 'web' && width >= MIN_DESKTOP_WIDTH && height >= MIN_DESKTOP_HEIGHT;

  if (!showFrame) {
    return <>{children}</>;
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.bezel}>
        <View style={[styles.screen, { height: Math.min(PHONE_HEIGHT, height - 64) }]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121216',
  },
  bezel: {
    padding: 2,
    borderRadius: 50,
    backgroundColor: '#2C2C33',
    boxShadow: '0 32px 80px rgba(0, 0, 0, 0.65)',
  },
  screen: {
    width: PHONE_WIDTH,
    borderRadius: 48,
    borderWidth: 10,
    borderColor: '#08080A',
    overflow: 'hidden',
    backgroundColor: '#0F0F12',
  },
});
