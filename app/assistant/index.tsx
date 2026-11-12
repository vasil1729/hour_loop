import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { ActionConfirmation } from '../../src/components/assistant/ActionConfirmation';
import { AssistantEmptyState } from '../../src/components/assistant/AssistantEmptyState';
import { ChatComposer } from '../../src/components/assistant/ChatComposer';
import { ChatMessage } from '../../src/components/assistant/ChatMessage';
import { Button } from '../../src/components/common/Button';
import { Screen } from '../../src/components/common/Screen';
import { assistantConfigIsUsable, loadAssistantConfig } from '../../src/features/assistant/storage/assistantSettings';
import { hasAssistantApiKey } from '../../src/features/assistant/storage/credentialStorage';
import type { AssistantChatMessage, AssistantConfig } from '../../src/features/assistant/assistantTypes';
import { useTranslation } from '../../src/i18n/I18nProvider';
import { useAssistantStore } from '../../src/store/assistantStore';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontSize, radius, spacing } from '../../src/theme/tokens';

export default function AssistantScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, isRTL } = useTranslation();
  const listRef = useRef<FlatList<AssistantChatMessage>>(null);

  const messages = useAssistantStore((state) => state.messages);
  const pendingAction = useAssistantStore((state) => state.pendingAction);
  const status = useAssistantStore((state) => state.status);
  const error = useAssistantStore((state) => state.error);
  const lastFailedText = useAssistantStore((state) => state.lastFailedText);
  const send = useAssistantStore((state) => state.send);
  const stop = useAssistantStore((state) => state.stop);
  const approve = useAssistantStore((state) => state.approve);
  const cancelAction = useAssistantStore((state) => state.cancelAction);
  const expireAction = useAssistantStore((state) => state.expireAction);
  const dismissAction = useAssistantStore((state) => state.dismissAction);
  const retryLast = useAssistantStore((state) => state.retryLast);
  const clear = useAssistantStore((state) => state.clear);

  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        useAssistantStore.getState().stop();
      }
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void (async () => {
        try {
          const nextConfig = await loadAssistantConfig(db);
          const keyExists = await hasAssistantApiKey(nextConfig.provider);
          if (cancelled) return;
          setConfig(nextConfig);
          setHasKey(keyExists);
        } catch {
          if (!cancelled) {
            setConfig(null);
            setHasKey(false);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
        useAssistantStore.getState().stop();
      };
    }, [db])
  );

  const ready =
    config !== null &&
    config.enabled &&
    assistantConfigIsUsable(config) &&
    hasKey;

  const busy = status === 'busy';
  const actionBlocks = pendingAction
    ? pendingAction.status === 'pending' || pendingAction.status === 'executing'
    : false;

  const dispatchSend = (text: string) => {
    if (!config || !ready || busy) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft('');
    void send(db, config, trimmed);
  };

  const handleClear = () => {
    Alert.alert(t('assistant.clearTitle'), t('assistant.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('assistant.clearConfirm'),
        style: 'destructive',
        onPress: () => {
          clear();
          setDraft('');
        },
      },
    ]);
  };

  const renderFooter = () =>
    pendingAction ? (
      <ActionConfirmation
        action={pendingAction}
        onConfirm={(id) => {
          if (config) void approve(db, config, id);
        }}
        onCancel={cancelAction}
        onDismiss={dismissAction}
        onExpire={expireAction}
      />
    ) : lastFailedText && !busy && config ? (
      <Button
        label={t('assistant.retry')}
        variant="secondary"
        onPress={() => {
          void retryLast(db, config);
        }}
      />
    ) : null;

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('assistant.back')}
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Ionicons
              name={isRTL ? 'arrow-forward' : 'arrow-back'}
              size={22}
              color={colors.text}
            />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
              {t('assistant.eyebrow')}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('assistant.title')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('assistant.clear')}
            accessibilityState={{ disabled: messages.length === 0 }}
            disabled={messages.length === 0}
            onPress={handleClear}
            hitSlop={10}
            style={({ pressed }) => ({
              opacity: messages.length === 0 ? 0.3 : pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !ready ? (
          <View style={styles.center}>
            <View
              style={[
                styles.setupCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name="sparkles-outline" size={26} color={colors.accent} />
              <Text style={[styles.setupTitle, { color: colors.text }]}>
                {t('assistant.setupTitle')}
              </Text>
              <Text style={[styles.setupBody, { color: colors.textSecondary }]}>
                {t('assistant.setupBody')}
              </Text>
              <Button
                label={t('assistant.openSettings')}
                onPress={() => router.push('/(tabs)/settings')}
              />
            </View>
          </View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(message) => message.id}
              renderItem={({ item }) => <ChatMessage message={item} />}
              contentContainerStyle={[
                styles.listContent,
                messages.length === 0 && styles.emptyContent,
              ]}
              ListEmptyComponent={
                <AssistantEmptyState onSelectPrompt={dispatchSend} />
              }
              ListFooterComponent={renderFooter}
              onContentSizeChange={() => {
                listRef.current?.scrollToEnd({ animated: true });
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
            {error && !lastFailedText ? (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.danger,
                  },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={colors.danger}
                />
                <Text style={[styles.errorText, { color: colors.danger }]}>
                  {error}
                </Text>
              </View>
            ) : null}
            <ChatComposer
              value={draft}
              onChangeText={setDraft}
              onSend={() => dispatchSend(draft)}
              onStop={stop}
              busy={busy}
              disabled={actionBlocks}
            />
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerTitles: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  setupCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  setupTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  setupBody: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
  },
});
