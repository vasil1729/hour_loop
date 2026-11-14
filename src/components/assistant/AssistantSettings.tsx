import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import {
  ASSISTANT_MAX_KEY_LENGTH,
  ASSISTANT_MODEL_OPTIONS,
} from '../../constants/assistant';
import { describeAssistantError } from '../../features/assistant/assistantErrors';
import { createAssistantProvider } from '../../features/assistant/providers/providerFactory';
import {
  assistantConfigIsUsable,
  loadAssistantConfig,
  saveAssistantConfig,
  validateAssistantConfig,
} from '../../features/assistant/storage/assistantSettings';
import {
  CREDENTIALS_PERSIST,
  deleteAssistantApiKey,
  getAssistantApiKey,
  hasAssistantApiKey,
  setAssistantApiKey,
} from '../../features/assistant/storage/credentialStorage';
import type {
  AssistantConfig,
  AssistantProviderId,
} from '../../features/assistant/assistantTypes';
import { useTranslation } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/types';
import { useAssistantStore } from '../../store/assistantStore';
import { useTheme } from '../../theme/ThemeContext';
import { Button } from '../common/Button';
import { ModelPickerModal } from './ModelPickerModal';
import { fontSize, radius, spacing } from '../../theme/tokens';

const PROVIDER_LABEL_KEYS: Record<AssistantProviderId, TranslationKey> = {
  openai: 'settings.assistantOpenAI',
  anthropic: 'settings.assistantAnthropic',
  gemini: 'settings.assistantGemini',
  openrouter: 'settings.assistantOpenRouter',
  groq: 'settings.assistantGroq',
  deepseek: 'settings.assistantDeepSeek',
  opencode: 'settings.assistantOpenCode',
  custom: 'settings.assistantCustom',
};

type TestState = 'idle' | 'testing' | 'success' | 'error';

const GROQ_KEY_URL = 'https://console.groq.com/keys';

type AssistantSettingsProps = {
  reloadToken?: number;
};

export function AssistantSettings({
  reloadToken = 0,
}: AssistantSettingsProps) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { t, isRTL } = useTranslation();
  const clearConversation = useAssistantStore((state) => state.clear);

  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAssistantConfig(db)
      .then((value) => {
        if (cancelled) return;
        setConfig(value);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [db, reloadToken]);

  const provider = config?.provider;

  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    void hasAssistantApiKey(provider).then((value) => {
      if (!cancelled) setHasSavedKey(value);
    }).catch(() => {
      if (!cancelled) setHasSavedKey(false);
    });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const updateConfig = (patch: Partial<AssistantConfig>) => {
    setConfig((current) => (current ? { ...current, ...patch } : current));
    setTestState('idle');
    setStatusMessage(null);
  };

  const handleSave = async () => {
    if (!config || busy) return;
    if (!config.model.trim()) {
      Alert.alert(
        t('settings.assistantSaveFailed'),
        t('settings.assistantModelRequired')
      );
      return;
    }
    setBusy(true);
    try {
      const key = apiKeyDraft.trim();
      if (key.length > ASSISTANT_MAX_KEY_LENGTH) {
        throw new Error('The API key is too long.');
      }
      const saved = await saveAssistantConfig(db, config);
      if (key) {
        await setAssistantApiKey(saved.provider, key);
      }
      setConfig(saved);
      setApiKeyDraft('');
      setHasSavedKey(
        await hasAssistantApiKey(saved.provider).catch(() => false)
      );
      setStatusMessage(t('settings.assistantSaved'));
    } catch (error) {
      Alert.alert(
        t('settings.assistantSaveFailed'),
        describeAssistantError(error)
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (!config || testState === 'testing') return;
    setTestState('testing');
    setStatusMessage(null);
    try {
      const key = apiKeyDraft.trim() || (await getAssistantApiKey(config.provider));
      if (!key) {
        setTestState('error');
        setStatusMessage(t('settings.assistantKeyRequired'));
        return;
      }
      const normalized = validateAssistantConfig(config);
      const provider = createAssistantProvider(normalized, key);
      await provider.test();
      setTestState('success');
      setStatusMessage(t('settings.assistantTestSuccess'));
    } catch (error) {
      setTestState('error');
      setStatusMessage(describeAssistantError(error));
    }
  };

  const handleClearKey = () => {
    if (!config) return;
    Alert.alert(
      t('settings.assistantClearKeyTitle'),
      t('settings.assistantClearKeyBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.assistantClearKey'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteAssistantApiKey(config.provider);
                setHasSavedKey(false);
                setStatusMessage(t('settings.assistantClearKeyDone'));
              } catch (error) {
                Alert.alert(
                  t('settings.assistantSaveFailed'),
                  describeAssistantError(error)
                );
              }
            })();
          },
        },
      ]
    );
  };

  const canSave =
    config !== null && (!config.enabled || assistantConfigIsUsable(config));
  const modelOptions = ASSISTANT_MODEL_OPTIONS.map((option) => ({
    ...option,
    providerLabel: t(PROVIDER_LABEL_KEYS[option.provider]),
  }));
  const selectedModel =
    modelOptions.find(
      (option) =>
        option.provider === config?.provider && option.model === config?.model
    ) ?? null;
  const selectedModelLabel =
    selectedModel?.label ?? (config?.model || t('settings.assistantModelChoose'));
  const selectedProviderLabel = selectedModel?.providerLabel ?? null;

  if (!loaded) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {t('settings.assistant')}
      </Text>
      <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
        {t('settings.assistantBody')}
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.switchRow}>
          <View style={styles.switchBody}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              {t('settings.assistantEnable')}
            </Text>
            <Text style={[styles.rowBody, { color: colors.textSecondary }]}>
              {t('settings.assistantEnableBody')}
            </Text>
          </View>
          <Switch
            value={config?.enabled ?? false}
            onValueChange={(value) => updateConfig({ enabled: value })}
            accessibilityLabel={t('settings.assistantEnable')}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchBody}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              {t('settings.assistantWrites')}
            </Text>
            <Text style={[styles.rowBody, { color: colors.textSecondary }]}>
              {t('settings.assistantWritesBody')}
            </Text>
          </View>
          <Switch
            value={config?.writesEnabled ?? true}
            onValueChange={(value) => updateConfig({ writesEnabled: value })}
            accessibilityLabel={t('settings.assistantWrites')}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      </View>

      <Text style={[styles.groupTitle, { color: colors.text }]}>
        {t('settings.assistantModel')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.assistantModel')}
        onPress={() => setModelPickerVisible(true)}
        style={[
          styles.modelRow,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <View style={styles.modelInfo}>
          <Text
            numberOfLines={1}
            style={[
              styles.modelValue,
              {
                color: config?.model ? colors.text : colors.textSecondary,
              },
            ]}
          >
            {selectedModelLabel}
          </Text>
          {selectedProviderLabel ? (
            <Text
              style={[styles.modelProvider, { color: colors.textSecondary }]}
            >
              {selectedProviderLabel}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name="chevron-down"
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {config?.provider === 'opencode' ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('settings.assistantOpenCodeHint')}
        </Text>
      ) : null}

      {config?.provider === 'anthropic' || config?.provider === 'gemini' ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('settings.assistantCompatibilityNote')}
        </Text>
      ) : null}

      <Text style={[styles.groupTitle, { color: colors.text }]}>
        {t('settings.assistantApiKey')}
      </Text>
      <TextInput
        value={apiKeyDraft}
        onChangeText={(value) => {
          setApiKeyDraft(value);
          setTestState('idle');
          setStatusMessage(null);
        }}
        placeholder={
          hasSavedKey
            ? t('settings.assistantApiKeySavedPlaceholder')
            : t('settings.assistantApiKeyPlaceholder')
        }
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        maxLength={ASSISTANT_MAX_KEY_LENGTH}
        textAlign={isRTL ? 'right' : 'left'}
        accessibilityLabel={t('settings.assistantApiKey')}
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      />
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {hasSavedKey
          ? CREDENTIALS_PERSIST
            ? t('settings.assistantApiKeySaved')
            : t('settings.assistantApiKeyWeb')
          : CREDENTIALS_PERSIST
            ? t('settings.assistantApiKeyHelp')
            : t('settings.assistantApiKeyWebHelp')}
      </Text>

      {config?.provider === 'groq' ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('settings.assistantGroqKeyHelp')}
          onPress={() => {
            void Linking.openURL(GROQ_KEY_URL).catch(() => undefined);
          }}
          hitSlop={8}
          style={[
            styles.keyHelpLink,
            { flexDirection: isRTL ? 'row-reverse' : 'row' },
          ]}
        >
          <Ionicons name="open-outline" size={14} color={colors.accent} />
          <Text
            style={[styles.keyHelpLinkText, { color: colors.accent }]}
          >
            {t('settings.assistantGroqKeyHelp')}
          </Text>
        </Pressable>
      ) : null}

      {statusMessage ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.status,
            {
              color:
                testState === 'error'
                  ? colors.danger
                  : testState === 'success'
                    ? colors.success
                    : colors.textSecondary,
            },
          ]}
        >
          {statusMessage}
        </Text>
      ) : null}

      <View style={styles.buttonRow}>
        <Button
          label={t('settings.assistantSave')}
          onPress={() => {
            void handleSave();
          }}
          loading={busy}
          disabled={busy || !canSave}
          style={styles.button}
        />
        <Button
          label={
            testState === 'testing'
              ? t('settings.assistantTesting')
              : t('settings.assistantTest')
          }
          variant="secondary"
          onPress={() => {
            void handleTest();
          }}
          loading={testState === 'testing'}
          disabled={testState === 'testing' || busy || !config}
          style={styles.button}
        />
      </View>

      {hasSavedKey ? (
        <Button
          label={t('settings.assistantClearKey')}
          variant="danger"
          onPress={handleClearKey}
        />
      ) : null}

      <Text style={[styles.groupTitle, { color: colors.text }]}>
        {t('settings.assistantPermissions')}
      </Text>
      <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
        {t('settings.assistantPermissionsBody')}
      </Text>

      <Text style={[styles.groupTitle, { color: colors.text }]}>
        {t('settings.assistantConversation')}
      </Text>
      <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
        {t('settings.assistantConversationBody')}
      </Text>
      <Button
        label={t('settings.assistantClearConversation')}
        variant="secondary"
        onPress={() => {
          clearConversation();
          setStatusMessage(t('settings.assistantConversationCleared'));
        }}
      />

      <Text style={[styles.groupTitle, { color: colors.text }]}>
        {t('settings.assistantPrivacy')}
      </Text>
      <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
        {t('settings.assistantPrivacyBody')}
      </Text>

      <ModelPickerModal
        visible={modelPickerVisible}
        options={modelOptions}
        selectedProvider={config?.provider ?? ''}
        selectedModel={config?.model ?? ''}
        onSelect={(option) => {
          setApiKeyDraft('');
          setTestState('idle');
          setStatusMessage(null);
          updateConfig({
            provider: option.provider,
            model: option.model,
            baseUrl: null,
          });
          setModelPickerVisible(false);
        }}
        onClose={() => setModelPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  switchBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 50,
  },
  modelInfo: {
    flex: 1,
    gap: 2,
  },
  modelValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  modelProvider: {
    fontSize: 12,
  },
  hint: {
    fontSize: fontSize.xs,
    lineHeight: 17,
  },
  keyHelpLink: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.xs,
  },
  keyHelpLinkText: {
    flexShrink: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  status: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
  },
});
