import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type {
  AssistantActionDetailKey,
  AssistantPendingAction,
} from '../../features/assistant/assistantTypes';
import { useTranslation } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/types';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, lineHeight, radius, spacing } from '../../theme/tokens';

const DETAIL_LABEL_KEYS: Record<AssistantActionDetailKey, TranslationKey> = {
  duration: 'assistant.detailDuration',
  focus: 'assistant.detailFocus',
  task: 'assistant.detailTask',
  capsules: 'assistant.detailCapsules',
  target: 'assistant.detailTarget',
  title: 'assistant.detailTitle',
  description: 'assistant.detailDescription',
  journalDone: 'assistant.detailDone',
  rollForward: 'assistant.detailRollForward',
  note: 'assistant.detailNote',
};

type ActionPreviewProps = {
  action: AssistantPendingAction;
};

export function ActionPreview({ action }: ActionPreviewProps) {
  const { colors } = useTheme();
  const { t, isRTL } = useTranslation();
  const isTimer = action.risk === 'timer';

  return (
    <View style={styles.container}>
      <View style={styles.riskRow}>
        <View
          style={[
            styles.riskBadge,
            {
              backgroundColor: isTimer ? colors.accentSoft : colors.surfaceAlt,
              borderColor: isTimer ? colors.accent : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.riskText,
              { color: isTimer ? colors.accent : colors.textSecondary },
            ]}
          >
            {isTimer
              ? t('assistant.actionRiskTimer')
              : t('assistant.actionRiskWrite')}
          </Text>
        </View>
      </View>
      <Text style={[styles.description, { color: colors.text }]}>
        {action.description}
      </Text>
      {action.details.length > 0 ? (
        <View style={styles.details}>
          {action.details.map((detail, index) => (
            <View
              key={`${detail.key}-${index}`}
              style={[
                styles.detailRow,
                {
                  borderColor: colors.border,
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                },
              ]}
            >
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                {t(DETAIL_LABEL_KEYS[detail.key])}
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: colors.text, textAlign: isRTL ? 'left' : 'right' },
                ]}
              >
                {detail.value || '—'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  riskRow: {
    flexDirection: 'row',
  },
  riskBadge: {
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  riskText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  description: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.body,
  },
  details: {
    gap: spacing.xs,
  },
  detailRow: {
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
  },
  detailLabel: {
    fontSize: fontSize.sm,
  },
  detailValue: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
