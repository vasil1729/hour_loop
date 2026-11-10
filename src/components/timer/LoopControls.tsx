import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/tokens';
import { Button } from '../common/Button';

type LoopControlsProps = {
  status: 'ACTIVE' | 'PAUSED';
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onMinimize: () => void;
};

export function LoopControls({
  status,
  busy = false,
  onPause,
  onResume,
  onStop,
  onMinimize,
}: LoopControlsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {status === 'ACTIVE' ? (
          <Button
            label="Pause"
            variant="secondary"
            onPress={onPause}
            disabled={busy}
            style={styles.primaryAction}
          />
        ) : (
          <Button
            label="Resume"
            onPress={onResume}
            disabled={busy}
            style={styles.primaryAction}
          />
        )}
        <Button
          label="Stop"
          variant="danger"
          onPress={onStop}
          disabled={busy}
          style={styles.primaryAction}
        />
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Button label="Back to Today" variant="ghost" onPress={onMinimize} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryAction: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
