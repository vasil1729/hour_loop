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
  ASSISTANT_MODEL_PRESETS,
  ASSISTANT_SUGGESTED_MODELS,
} from '../../constants/assistant';
import { describeAssistantError } from '../../features/assistant/assistantErrors';
import {
  createAssistantProvider,
  listAssistantProviderModels,
} from '../../features/assistant/providers/providerFactory';
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

const PROVIDERS: { id: AssistantProviderId; labelKey: TranslationKey }[] = [
  { id: 'openai', labelKey: 'settings.assistantOpenAI' },
  { id: 'anthropic', labelKey: 'settings.assistantAnthropic' },
  { id: 'gemini', labelKey: 'settings.assistantGemini' },
  { id: 'openrouter', labelKey: 'settings.assistantOpenRouter' },
  { id: 'groq', labelKey: 'settings.assistantGroq' },
  { id: 'deepseek', labelKey: 'settings.assistantDeepSeek' },
  { id: 'opencode', labelKey: 'settings.assistantOpenCode' },
  { id: 'custom', labelKey: 'settings.assistantCustom' },
];

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
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

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

  const providerLabel =
    PROVIDERS.find((provider) => provider.id === config?.provider)?.labelKey ??
    'settings.assistantGroq';
  const canSave =
    config !== null && (!config.enabled || assistantConfigIsUsable(config));

  const presetModels = (current: AssistantConfig): string[] =>
    current.provider === 'custom'
      ? []
      : ASSISTANT_MODEL_PRESETS[current.provider];

  const mergeModels = (...groups: string[][]): string[] =>
    Array.from(new Set(groups.flat().filter(Boolean)));

  const refreshModels = async (current: AssistantConfig) => {
    const presets = presetModels(current);
    setModelsLoading(true);
    setModelsError(null);
    setAvailableModels((existing) => mergeModels(presets, existing));
    try {
      const key =
        apiKeyDraft.trim() ||
        (await getAssistantApiKey(current.provider));
      if (!key) {
        setModelsError(t('settings.modelPickerNeedKey'));
        return;
      }
      const models = await listAssistantProviderModels(current, key);
      const relevant = presets.length
        ? presets.filter((model) => models.includes(model))
        : models;
      setAvailableModels((existing) =>
        mergeModels(
          relevant.length > 0 ? relevant : presets,
          presets,
          current.model ? [current.model] : [],
          existing
        )
      );
    } catch (error) {
      setModelsError(describeAssistantError(error));
    } finally {
      setModelsLoading(false);
    }
  };

  const openModelPicker = () => {
    if (!config) return;
    setModelPickerVisible(true);
    setModelsError(null);
    setAvailableModels((existing) =>
      mergeModels(presetModels(config), existing, config.model ? [config.model] : [])
    );
    void refreshModels(config);
  };

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
        {t('settings.assistantProvider')}
      </Text>
      <View style={styles.chips}>
        {PROVIDERS.map((provider) => {
          const selected = config?.provider === provider.id;
          return (
            <Pressable
              key={provider.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                const suggestion =
                  provider.id === 'custom'
                    ? ''
                    : ASSISTANT_SUGGESTED_MODELS[provider.id];
                const previousSuggestion =
                  config && config.provider !== 'custom'
                    ? ASSISTANT_SUGGESTED_MODELS[config.provider]
                    : null;
                const currentModel = config?.model.trim() ?? '';
                const shouldReplaceModel =
                  !currentModel || currentModel === previousSuggestion;
                setApiKeyDraft('');
                setTestState('idle');
                setStatusMessage(null);
                setAvailableModels([]);
                setModelsError(null);
                setModelPickerVisible(false);
                updateConfig({
                  provider: provider.id,
                  baseUrl: provider.id === 'custom' ? config?.baseUrl ?? '' : null,
                  model: shouldReplaceModel ? suggestion : currentModel,
                });
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.accent : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? '#FFFFFF' : colors.text },
                ]}
              >
                {t(provider.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.groupTitle, { color: colors.text }]}>
        {t('settings.assistantConnection')}
      </Text>
      <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
        {t('settings.assistantProviderHint', {
          provider: t(providerLabel),
        })}
      </Text>

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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.assistantModel')}
        onPress={openModelPicker}
        style={[
          styles.input,
          styles.modelRow,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.modelValue,
            {
              color: config?.model ? colors.text : colors.textSecondary,
            },
          ]}
        >
          {config?.model || t('settings.assistantModelChoose')}
        </Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {config?.provider === 'custom' ? (
        <TextInput
          value={config.baseUrl ?? ''}
          onChangeText={(value) => updateConfig({ baseUrl: value })}
          placeholder={t('settings.assistantBaseUrlPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={400}
          textAlign={isRTL ? 'right' : 'left'}
          accessibilityLabel={t('settings.assistantBaseUrl')}
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        />
      ) : null}

      {config?.provider === 'custom' ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('settings.assistantCustomHint')}
        </Text>
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
        models={availableModels}
        selected={config?.model ?? ''}
        loading={modelsLoading}
        error={modelsError}
        onSelect={(model) => {
          updateConfig({ model });
          setModelPickerVisible(false);
        }}
        onRefresh={() => {
          if (config) void refreshModels(config);
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
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
  },
  modelValue: {
    flex: 1,
    fontSize: 15,
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
