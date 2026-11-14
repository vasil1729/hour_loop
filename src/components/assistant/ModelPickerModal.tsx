import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AssistantProviderId } from '../../features/assistant/assistantTypes';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

export type ModelPickerOption = {
  provider: AssistantProviderId;
  model: string;
  label: string;
  providerLabel: string;
};

type ModelPickerModalProps = {
  visible: boolean;
  options: ModelPickerOption[];
  selectedProvider: string;
  selectedModel: string;
  onSelect: (option: ModelPickerOption) => void;
  onClose: () => void;
};

export function ModelPickerModal({
  visible,
  options,
  selectedProvider,
  selectedModel,
  onSelect,
  onClose,
}: ModelPickerModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const sections = useMemo(() => {
    const groups = new Map<string, ModelPickerOption[]>();
    for (const option of options) {
      const group = groups.get(option.providerLabel) ?? [];
      group.push(option);
      groups.set(option.providerLabel, group);
    }
    return Array.from(groups, ([title, data]) => ({ title, data }));
  }, [options]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('settings.modelPickerTitle')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={onClose}
              hitSlop={10}
            >
              <Text style={[styles.close, { color: colors.textSecondary }]}>
                {t('common.close')}
              </Text>
            </Pressable>
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(option) => `${option.provider}:${option.model}`}
            stickySectionHeadersEnabled={false}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section }) => (
              <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
                {section.title}
              </Text>
            )}
            renderItem={({ item }) => {
              const isSelected =
                item.provider === selectedProvider &&
                item.model === selectedModel;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${item.label}, ${item.providerLabel}`}
                  onPress={() => onSelect(item)}
                  style={[
                    styles.modelRow,
                    {
                      backgroundColor: isSelected
                        ? colors.accentSoft
                        : colors.background,
                      borderColor: isSelected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.modelText,
                      { color: isSelected ? colors.accent : colors.text },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {isSelected ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.accent}
                    />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '78%',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  close: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  modelText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
});
