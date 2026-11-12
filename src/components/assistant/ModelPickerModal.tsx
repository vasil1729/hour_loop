import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';
import { Button } from '../common/Button';

type ModelPickerModalProps = {
  visible: boolean;
  models: string[];
  selected: string;
  loading: boolean;
  error: string | null;
  onSelect: (model: string) => void;
  onRefresh: () => void;
  onClose: () => void;
};

export function ModelPickerModal({
  visible,
  models,
  selected,
  loading,
  error,
  onSelect,
  onRefresh,
  onClose,
}: ModelPickerModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [customModel, setCustomModel] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setCustomModel('');
  }, [visible]);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? models.filter((model) => model.toLowerCase().includes(query))
    : models;

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

          <View style={styles.searchRow}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('settings.modelPickerSearch')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('settings.modelPickerSearch')}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.searchInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.modelPickerRefresh')}
              onPress={onRefresh}
              disabled={loading}
              hitSlop={8}
              style={[
                styles.refreshButton,
                {
                  backgroundColor: colors.surfaceAlt,
                  opacity: loading ? 0.5 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="refresh" size={18} color={colors.accent} />
              )}
            </Pressable>
          </View>

          {error ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.error, { color: colors.danger }]}
            >
              {error}
            </Text>
          ) : null}

          {loading && models.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.helper, { color: colors.textSecondary }]}>
                {t('settings.modelPickerLoading')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(model) => model}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={[styles.helper, { color: colors.textSecondary }]}>
                  {t('settings.modelPickerEmpty')}
                </Text>
              }
              renderItem={({ item }) => {
                const isSelected = item === selected;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={item}
                    onPress={() => onSelect(item)}
                    style={[
                      styles.modelRow,
                      {
                        backgroundColor: isSelected
                          ? colors.accentSoft
                          : colors.background,
                        borderColor: isSelected
                          ? colors.accent
                          : colors.border,
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
                      {item}
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
          )}

          <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
            {t('settings.modelPickerCustom')}
          </Text>
          <View style={styles.customRow}>
            <TextInput
              value={customModel}
              onChangeText={setCustomModel}
              placeholder={t('settings.modelPickerCustomPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('settings.modelPickerCustomPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={200}
              style={[
                styles.searchInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <Button
              label={t('settings.modelPickerUse')}
              onPress={() => onSelect(customModel.trim())}
              disabled={!customModel.trim()}
              style={styles.useButton}
            />
          </View>
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
    maxHeight: '86%',
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
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: 12,
    lineHeight: 17,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
  },
  list: {
    flexGrow: 0,
    maxHeight: 300,
  },
  listContent: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  modelRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  modelText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  useButton: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
});
