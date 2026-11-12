import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AssistantPendingAction } from '../../features/assistant/assistantTypes';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { Button } from '../common/Button';
import { fontSize, lineHeight, radius, spacing } from '../../theme/tokens';
import { ActionPreview } from './ActionPreview';

type ActionConfirmationProps = {
  action: AssistantPendingAction;
  onConfirm: (actionId: string) => void;
  onCancel: (actionId: string) => void;
  onDismiss: () => void;
  onExpire: (actionId: string) => void;
};

export function ActionConfirmation({
  action,
  onConfirm,
  onCancel,
  onDismiss,
  onExpire,
}: ActionConfirmationProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isPending = action.status === 'pending';
  const isExecuting = action.status === 'executing';
  const isDone = action.status === 'executed';
  const isFailed = action.status === 'failed';
  const isCancelled = action.status === 'cancelled';
  const isExpired = action.status === 'expired';

  useEffect(() => {
    if (!isPending) return;
    const remaining = action.expiresAt - Date.now();
    if (remaining <= 0) {
      onExpire(action.id);
      return;
    }
    const timeout = setTimeout(() => {
      onExpire(action.id);
    }, remaining + 50);
    return () => clearTimeout(timeout);
  }, [action.expiresAt, action.id, isPending, onExpire]);

  const statusIcon = isDone
    ? 'checkmark-circle'
    : isFailed
      ? 'alert-circle'
      : isCancelled || isExpired
        ? 'close-circle'
        : 'shield-checkmark';

  const statusColor = isDone
    ? colors.success
    : isFailed
      ? colors.danger
      : isCancelled || isExpired
        ? colors.textSecondary
        : colors.accent;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.accent },
      ]}
      accessibilityLabel={t('assistant.actionPendingTitle')}
    >
      <View style={styles.header}>
        <Ionicons name={statusIcon} size={18} color={statusColor} />
        <Text style={[styles.title, { color: colors.text }]}>
          {isDone
            ? t('assistant.actionExecuted')
            : isFailed
              ? t('assistant.actionFailed')
              : isCancelled
                ? t('assistant.actionCancelled')
                : isExpired
                  ? t('assistant.actionExpired')
                  : t('assistant.actionPendingTitle')}
        </Text>
      </View>

      <ActionPreview action={action} />

      {isDone && action.result ? (
        <Text style={[styles.result, { color: colors.success }]}>
          {action.result}
        </Text>
      ) : null}
      {isFailed && action.error ? (
        <Text style={[styles.result, { color: colors.danger }]}>
          {action.error}
        </Text>
      ) : null}
      {isExecuting ? (
        <View style={styles.workingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.result, { color: colors.textSecondary }]}>
            {t('assistant.actionWorking')}
          </Text>
        </View>
      ) : null}

      {isPending ? (
        <View style={styles.actions}>
          <Button
            label={t('assistant.actionCancel')}
            variant="secondary"
            onPress={() => onCancel(action.id)}
            style={styles.action}
          />
          <Button
            label={t('assistant.actionConfirm')}
            onPress={() => onConfirm(action.id)}
            style={styles.action}
          />
        </View>
      ) : !isExecuting ? (
        <Button
          label={t('assistant.actionDismiss')}
          variant="secondary"
          onPress={onDismiss}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  result: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.body,
  },
  workingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
