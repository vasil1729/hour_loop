import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTranslation } from '../../i18n/I18nProvider';
import { spacing } from '../../theme/tokens';
import { Button } from '../common/Button';

type LoopControlsProps = {
  status: 'ACTIVE' | 'PAUSED';
  targetReached?: boolean;
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function LoopControls({
  status,
  targetReached = false,
  busy = false,
  onPause,
  onResume,
  onStop,
}: LoopControlsProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      {!targetReached ? (
        <Button
          label={
            status === 'ACTIVE'
              ? t('loopControls.pause')
              : t('loopControls.resume')
          }
          onPress={status === 'ACTIVE' ? onPause : onResume}
          disabled={busy}
          style={styles.action}
        />
      ) : null}
      <Button
        label={
          targetReached ? t('loopControls.close') : t('loopControls.stop')
        }
        variant="danger"
        onPress={onStop}
        disabled={busy}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
