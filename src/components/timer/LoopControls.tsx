import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/tokens';
import { Button } from '../common/Button';

type LoopControlsProps = {
  status: 'ACTIVE' | 'PAUSED';
  targetReached?: boolean;
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onMinimize: () => void;
};

export function LoopControls({
  status,
  targetReached = false,
  busy = false,
  onPause,
  onResume,
  onStop,
  onMinimize,
}: LoopControlsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {!targetReached && status === 'ACTIVE' ? (
          <Button
            label={t('loopControls.pause')}
            variant="secondary"
            onPress={onPause}
            disabled={busy}
            style={styles.primaryAction}
          />
        ) : null}
        {!targetReached && status === 'PAUSED' ? (
          <Button
            label={t('loopControls.resume')}
            onPress={onResume}
            disabled={busy}
            style={styles.primaryAction}
          />
        ) : null}
        <Button
          label={
            targetReached ? t('loopControls.close') : t('loopControls.stop')
          }
          variant="danger"
          onPress={onStop}
          disabled={busy}
          style={styles.primaryAction}
        />
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Button
        label={t('loopControls.backToToday')}
        variant="ghost"
        onPress={onMinimize}
      />
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
