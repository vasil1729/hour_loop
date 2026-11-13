import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Screen } from '../../src/components/common/Screen';
import { LoopHistoryRow } from '../../src/components/history/LoopHistoryRow';
import {
  currentDayKey,
  formatDayLabel,
} from '../../src/domain/shared/dateUtils';
import {
  formatDurationCompact,
  formatElapsed,
  progressRatio,
} from '../../src/domain/timer/timerEngine';
import { listRecentLoops } from '../../src/database/repositories/loopsRepository';
import type { LoopItem } from '../../src/domain/types';
import {
  attachLoopMetrics,
  type LoopWithMetrics,
} from '../../src/features/loops/loopMetrics';
import { loopService } from '../../src/features/loops/loopService';
import { useTranslation } from '../../src/i18n/I18nProvider';
import { localizeError } from '../../src/i18n';
import { syncLoopNotification } from '../../src/services/notifications/notificationService';
import { useActiveLoop } from '../../src/hooks/useActiveLoop';
import { useIntentions } from '../../src/hooks/useIntentions';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { activeLoop, elapsedSeconds, refresh } = useActiveLoop();
  const [recentLoops, setRecentLoops] = useState<LoopWithMetrics[]>([]);
  const [currentCapsule, setCurrentCapsule] = useState<LoopItem | null>(null);
  const { daily, refresh: refreshIntentions } = useIntentions();
  const [loopActionBusy, setLoopActionBusy] = useState(false);

  const activeLoopId = activeLoop?.id;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        const [recent, items] = await Promise.all([
          listRecentLoops(db, 5),
          activeLoopId
            ? loopService.getLoopItems(db, activeLoopId)
            : Promise.resolve([]),
        ]);
        const withMetrics = await attachLoopMetrics(db, recent);
        if (!cancelled) {
          setRecentLoops(withMetrics);
          setCurrentCapsule(items.find((item) => item.current) ?? null);
        }
      };

      void load();
      return () => {
        cancelled = true;
      };
    }, [activeLoopId, db])
  );

  const todayKey = currentDayKey();
  const activeProgress = activeLoop
    ? progressRatio(activeLoop.target_duration_seconds, elapsedSeconds)
    : 0;
  const activeTargetReached = activeLoop
    ? elapsedSeconds >= activeLoop.target_duration_seconds
    : false;

  useEffect(() => {
    if (activeLoop?.status === 'PAUSED' && activeTargetReached) {
      void refreshIntentions();
    }
  }, [activeLoop?.status, activeTargetReached, refreshIntentions]);

  const handleToggleLoop = async () => {
    if (!activeLoop || loopActionBusy) return;
    setLoopActionBusy(true);
    try {
      const updated =
        activeLoop.status === 'ACTIVE'
          ? await loopService.pauseLoop(db, activeLoop.id)
          : await loopService.resumeLoop(db, activeLoop.id);
      await syncLoopNotification(db, updated, {
        requestPermission: activeLoop.status === 'PAUSED',
      }).catch(() => undefined);
      await refresh(db);
    } catch (error) {
      Alert.alert(
        activeLoop.status === 'ACTIVE'
          ? t('today.couldNotPause')
          : t('today.couldNotResume'),
        localizeError(error)
      );
    } finally {
      setLoopActionBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
            {t('today.eyebrow')}
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {formatDayLabel(todayKey)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.open')}
          onPress={() => router.push('/assistant')}
          style={({ pressed }) => [
            styles.assistantButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
          <Text style={[styles.assistantButtonText, { color: colors.accent }]}>
            {t('assistant.open')}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('today.dailyOverview')}
        onPress={() =>
          router.push({
            pathname: '/day/[date]',
            params: { date: todayKey },
          })
        }
        style={({ pressed }) => [
          styles.dayCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={styles.dayCardHeader}>
          <Text style={[styles.dayCardLabel, { color: colors.textSecondary }]}>
            {t('today.daily')}
          </Text>
          <Text style={[styles.dayCardAction, { color: colors.accent }]}>
            {t('today.openAction')}
          </Text>
        </View>
        <Text style={[styles.dayCardTitle, { color: colors.text }]}>
          {t('today.dailyOverview')}
        </Text>
        <Text style={[styles.dayCardMeta, { color: colors.textSecondary }]}>
          {t('today.focusedToday', {
            duration: formatDurationCompact(daily?.actualSeconds ?? 0),
          })}
          {daily?.intention
            ? t('today.percentOfTarget', {
                percent: daily.progress.percent,
              })
            : t('today.setTargets')}
        </Text>
        {daily?.intention ? (
          <View style={[styles.dayTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.dayFill,
                {
                  width: `${daily.progress.percent}%`,
                  backgroundColor: daily.progress.reached
                    ? colors.success
                    : colors.accent,
                },
              ]}
            />
          </View>
        ) : null}
      </Pressable>

      {activeLoop ? (
        <View
          style={[
            styles.activeCard,
            { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('today.returnA11y', {
              sequence: activeLoop.sequence_number,
              percent: Math.round(activeProgress * 100),
            })}
            onPress={() => router.push('/loop/active')}
            style={({ pressed }) => [
              styles.activeCardBody,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <View style={styles.activeTop}>
              <View style={styles.activeIdentifier}>
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.activeLabel, { color: colors.accent }]}>
                  H{activeLoop.sequence_number} ·{' '}
                  {activeTargetReached
                    ? t('today.statusTargetReached')
                    : activeLoop.status === 'PAUSED'
                      ? t('today.statusPaused')
                      : t('today.statusInProgress')}
                </Text>
              </View>
              <Text style={[styles.activeElapsed, { color: colors.text }]}>
                {formatElapsed(elapsedSeconds)}
              </Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(activeProgress * 100),
              }}
              style={[
                styles.activeProgressTrack,
                { backgroundColor: colors.background },
              ]}
            >
              <View
                style={[
                  styles.activeProgressFill,
                  {
                    width: `${Math.round(activeProgress * 100)}%`,
                    backgroundColor: activeTargetReached
                      ? colors.success
                      : colors.accent,
                  },
                ]}
              />
            </View>
            <Text
              numberOfLines={2}
              style={[styles.activeFocus, { color: colors.text }]}
            >
              {currentCapsule?.text ||
                activeLoop.focus ||
                t('today.continueFocus')}
            </Text>
          </Pressable>

          <View style={styles.activeFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('today.returnToLoop')}
              onPress={() => router.push('/loop/active')}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[styles.activeCta, { color: colors.accent }]}>
                {t('today.returnToLoop')}
              </Text>
            </Pressable>

            {!activeTargetReached ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  activeLoop.status === 'ACTIVE'
                    ? t('today.pauseLoop')
                    : t('today.resumeLoop')
                }
                accessibilityState={{
                  busy: loopActionBusy,
                  disabled: loopActionBusy,
                }}
                disabled={loopActionBusy}
                onPress={() => {
                  void handleToggleLoop();
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.loopActionButton,
                  {
                    backgroundColor: colors.surface,
                    opacity: loopActionBusy ? 0.6 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                {loopActionBusy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons
                    name={activeLoop.status === 'ACTIVE' ? 'pause' : 'play'}
                    size={16}
                    color={colors.accent}
                  />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.startCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.startTitle, { color: colors.text }]}>
            {t('today.readyTitle')}
          </Text>
          <Text style={[styles.startBody, { color: colors.textSecondary }]}>
            {t('today.readyBody')}
          </Text>
          <Button
            label={t('today.startLoop')}
            onPress={() => router.push('/loop/start')}
            style={styles.startButton}
          />
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('today.recentLoops')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('today.history')}
            onPress={() => router.push('/(tabs)/history')}
            hitSlop={10}
          >
            <Text style={[styles.sectionAction, { color: colors.accent }]}>
              {t('today.history')}
            </Text>
          </Pressable>
        </View>

        {recentLoops.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title={t('today.noClosedTitle')}
              message={t('today.noClosedMessage')}
            />
          </View>
        ) : (
          <View style={styles.list}>
            {recentLoops.map(({ loop, elapsedSeconds: loopElapsed }) => (
              <LoopHistoryRow
                key={loop.id}
                loop={loop}
                elapsedSeconds={loopElapsed}
                showDate
                onPress={() => router.push(`/loop/${loop.id}`)}
              />
            ))}
          </View>
        )}
      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  headerTitles: {
    flex: 1,
    gap: spacing.xs,
  },
  assistantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  assistantButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  dayCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dayCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  dayCardAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  dayCardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  dayCardMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  dayTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  dayFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  activeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  activeCardBody: {
    gap: spacing.sm,
  },
  activeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  loopActionButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  activeIdentifier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  activeElapsed: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  activeProgressTrack: {
    height: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  activeProgressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  activeFocus: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '600',
  },
  activeCta: {
    fontSize: 13,
    fontWeight: '700',
  },
  startCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  startTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  startBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  startButton: {
    marginTop: spacing.sm,
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    flexShrink: 0,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionAction: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    gap: spacing.sm,
  },
  emptyWrap: {
    minHeight: 160,
  },
});
