import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  EDGE_MODEL_TIERS,
  formatEdgeModelSize,
  type EdgeModel,
} from '../../constants/edgeModels';
import {
  EdgeModelError,
  edgeModelManager,
  type EdgeDownloadProgress,
  type EdgeModelFileState,
} from '../../features/assistant/edge/edgeModelManager';
import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type DownloadState = {
  status: 'downloading' | 'verifying';
  percent: number;
};

type EdgeModelSectionProps = {
  activeModelId: string | null;
  onUseModel: (modelId: string) => void;
  onActiveModelDeleted: (modelId: string) => void;
};

function errorMessage(
  error: unknown,
  t: ReturnType<typeof useTranslation>['t'],
  model: EdgeModel
): string {
  if (error instanceof EdgeModelError) {
    if (error.code === 'disk_space') {
      return t('settings.edgeStorageBody', {
        size: formatEdgeModelSize(model.downloadSizeBytes * 1.5),
      });
    }
    if (error.code === 'checksum') return t('settings.edgeChecksumFailed');
    if (error.code === 'network') return t('assistant.errorNetwork');
    if (error.code === 'unsupported') {
      return t('settings.assistantOnDeviceWeb');
    }
  }
  return t('settings.edgeDownloadFailed');
}

export function EdgeModelSection({
  activeModelId,
  onUseModel,
  onActiveModelDeleted,
}: EdgeModelSectionProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [states, setStates] = useState<EdgeModelFileState[]>([]);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const controllers = useRef(new Map<string, AbortController>());

  const refresh = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const next = await Promise.all(
      Object.values(EDGE_MODEL_TIERS)
        .flatMap((tier) => tier.models)
        .map((model) =>
          edgeModelManager
            .getModelFileState(model.id)
            .catch(() => ({ model, downloaded: false, partialBytes: null }))
        )
    );
    setStates(next);
  }, []);

  useEffect(() => {
    const activeControllers = controllers.current;
    void refresh();
    return () => {
      for (const controller of activeControllers.values()) {
        controller.abort();
      }
      activeControllers.clear();
    };
  }, [refresh]);

  const setDownload = (id: string, value: DownloadState | null) => {
    setDownloads((current) => {
      const next = { ...current };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  };

  const startDownload = async (model: EdgeModel) => {
    const run = async () => {
      const controller = new AbortController();
      controllers.current.set(model.id, controller);
      setDownload(model.id, { status: 'downloading', percent: 0 });
      try {
        await edgeModelManager.downloadModel(model.id, {
          signal: controller.signal,
          onProgress: (progress: EdgeDownloadProgress) => {
            setDownload(model.id, {
              status: progress.phase,
              percent: Math.round(progress.percent),
            });
          },
        });
        await refresh();
      } catch (error) {
        if (
          error instanceof EdgeModelError &&
          error.code === 'cancelled'
        ) {
          return;
        }
        Alert.alert(
          t('settings.edgeDownloadFailed'),
          errorMessage(error, t, model)
        );
      } finally {
        controllers.current.delete(model.id);
        setDownload(model.id, null);
      }
    };

    const cellular = await edgeModelManager
      .isCellularConnection()
      .catch(() => false);
    if (cellular) {
      Alert.alert(
        t('settings.edgeCellularTitle'),
        t('settings.edgeCellularBody', {
          size: formatEdgeModelSize(model.downloadSizeBytes),
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.edgeDownload'),
            onPress: () => {
              void run();
            },
          },
        ]
      );
      return;
    }
    await run();
  };

  const cancelDownload = (id: string) => {
    controllers.current.get(id)?.abort();
    setDownload(id, null);
    void edgeModelManager.cancelModelDownload(id);
  };

  const deleteModel = (model: EdgeModel) => {
    Alert.alert(
      t('settings.edgeDeleteTitle', { model: model.displayName }),
      t('settings.edgeDeleteBody', {
        size: formatEdgeModelSize(model.downloadSizeBytes),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await edgeModelManager.deleteModel(model.id).catch(() => undefined);
              if (activeModelId === model.id) {
                onActiveModelDeleted(model.id);
              }
              await refresh();
            })();
          },
        },
      ]
    );
  };

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.notice,
          { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        ]}
      >
        <Ionicons name="phone-portrait-outline" size={18} color={colors.accent} />
        <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
          {t('settings.assistantOnDeviceWeb')}
        </Text>
      </View>
    );
  }

  const stateById = new Map(states.map((state) => [state.model.id, state]));

  return (
    <View style={styles.section}>
      <Text style={[styles.groupTitle, { color: colors.text }]}>
        {t('settings.assistantOnDevice')}
      </Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {t('settings.assistantOnDeviceHint')}
      </Text>

      {(Object.keys(EDGE_MODEL_TIERS) as (keyof typeof EDGE_MODEL_TIERS)[]).map(
        (tierKey) => {
          const tier = EDGE_MODEL_TIERS[tierKey];
          return (
            <View key={tierKey} style={styles.tier}>
              <Text style={[styles.tierTitle, { color: colors.textSecondary }]}>
                {t(tier.labelKey as never)}
              </Text>
              {tier.models.map((model) => {
                const state = stateById.get(model.id);
                const download = downloads[model.id];
                const active = activeModelId === model.id;
                const downloaded = state?.downloaded ?? false;
                return (
                  <View
                    key={model.id}
                    style={[
                      styles.modelRow,
                      {
                        backgroundColor: active
                          ? colors.accentSoft
                          : colors.surface,
                        borderColor: active ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.modelInfo}>
                      <Text style={[styles.modelName, { color: colors.text }]}>
                        {model.displayName}
                      </Text>
                      <Text
                        style={[styles.modelMeta, { color: colors.textSecondary }]}
                      >
                        {formatEdgeModelSize(model.downloadSizeBytes)} ·{' '}
                        {t('settings.edgeRam', { ram: model.minRamGb })} ·{' '}
                        {t('settings.edgeContext', {
                          tokens: model.contextLimit,
                        })}
                      </Text>
                      {model.noteKey ? (
                        <Text
                          style={[
                            styles.modelNote,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {t(model.noteKey)}
                        </Text>
                      ) : null}
                    </View>

                    {download ? (
                      <View style={styles.actions}>
                        <Text
                          accessibilityLiveRegion="polite"
                          style={[styles.progress, { color: colors.accent }]}
                        >
                          {download.status === 'verifying'
                            ? t('settings.edgeVerifying')
                            : t('settings.edgeDownloading', {
                                percent: download.percent,
                              })}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('settings.edgeCancel')}
                          onPress={() => cancelDownload(model.id)}
                          hitSlop={8}
                          style={styles.actionButton}
                        >
                          <Text style={[styles.actionText, { color: colors.danger }]}>
                            {t('settings.edgeCancel')}
                          </Text>
                        </Pressable>
                      </View>
                    ) : downloaded ? (
                      <View style={styles.actions}>
                        {active ? (
                          <Text style={[styles.ready, { color: colors.accent }]}>
                            {t('settings.edgeActive')}
                          </Text>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${t('settings.edgeUse')} ${model.displayName}`}
                            onPress={() => onUseModel(model.id)}
                            hitSlop={8}
                            style={styles.actionButton}
                          >
                            <Text style={[styles.actionText, { color: colors.accent }]}>
                              {t('settings.edgeUse')}
                            </Text>
                          </Pressable>
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${t('settings.edgeDelete')} ${model.displayName}`}
                          onPress={() => deleteModel(model)}
                          hitSlop={8}
                          style={styles.actionButton}
                        >
                          <Text style={[styles.actionText, { color: colors.danger }]}>
                            {t('settings.edgeDelete')}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t('settings.edgeDownload')} ${model.displayName}`}
                        onPress={() => {
                          void startDownload(model);
                        }}
                        hitSlop={8}
                        style={styles.actionButton}
                      >
                        <Text style={[styles.actionText, { color: colors.accent }]}>
                          {t('settings.edgeDownload')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          );
        }
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  tier: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tierTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
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
  },
  modelInfo: {
    flex: 1,
    gap: 2,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '700',
  },
  modelMeta: {
    fontSize: 11,
    lineHeight: 16,
  },
  modelNote: {
    fontSize: 10,
    lineHeight: 14,
  },
  actions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  actionButton: {
    paddingVertical: spacing.xs,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progress: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  ready: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
