import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';
import { Button } from '../common/Button';

type TaskFormModalProps = {
  visible: boolean;
  heading: string;
  parentTitle?: string | null;
  initialTitle?: string;
  initialDescription?: string;
  busy?: boolean;
  onSave: (values: { title: string; description: string }) => void;
  onClose: () => void;
};

export function TaskFormModal({
  visible,
  heading,
  parentTitle,
  initialTitle = '',
  initialDescription = '',
  busy = false,
  onSave,
  onClose,
}: TaskFormModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDescription(initialDescription);
    }
  }, [initialDescription, initialTitle, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
      >
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.heading, { color: colors.text }]}>{heading}</Text>
          {parentTitle ? (
            <Text style={[styles.parent, { color: colors.textSecondary }]}>
              {t('taskForm.under', { parent: parentTitle })}
            </Text>
          ) : null}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('taskForm.titlePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoFocus
            maxLength={200}
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('taskForm.descriptionPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={2000}
            style={[
              styles.input,
              styles.multiline,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            textAlignVertical="top"
          />
          <View style={styles.actions}>
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={onClose}
              style={styles.action}
              disabled={busy}
            />
            <Button
              label={t('common.save')}
              onPress={() => onSave({ title, description })}
              style={styles.action}
              loading={busy}
              disabled={!title.trim()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxWidth: 440,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
  },
  parent: {
    fontSize: 13,
    marginTop: -spacing.xs,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  multiline: {
    minHeight: 88,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
