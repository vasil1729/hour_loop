import React, { useCallback, useState } from 'react';
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
import { IntentionBar } from '../../src/components/intentions/IntentionBar';
import { IntentionEditModal } from '../../src/components/intentions/IntentionEditModal';
import { INTENTION_PRESETS_MINUTES } from '../../src/constants/intentions';
import {
  currentDayKey,
  currentMonthKey,
  formatDayLabel,
} from '../../src/domain/shared/dateUtils';
import { formatElapsed, progressRatio } from '../../src/domain/timer/timerEngine';
import { listRecentLoops } from '../../src/database/repositories/loopsRepository';
import {
  attachLoopMetrics,
  type LoopWithMetrics,
} from '../../src/features/loops/loopMetrics';
import { loopService } from '../../src/features/loops/loopService';
import {
  clearIntention,
  setIntention,
} from '../../src/features/intentions/intentionsService';
import { syncLoopNotification } from '../../src/services/notifications/notificationService';
import { useActiveLoop } from '../../src/hooks/useActiveLoop';
import { useIntentions } from '../../src/hooks/useIntentions';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { activeLoop, elapsedSeconds, refresh } = useActiveLoop();
  const [recentLoops, setRecentLoops] = useState<LoopWithMetrics[]>([]);
  const { daily, monthly, refresh: refreshIntentions } = useIntentions();
  const [editingIntention, setEditingIntention] = useState<'daily' | 'monthly' | null>(
    null
  );
  const [savingIntention, setSavingIntention] = useState(false);
  const [loopActionBusy, setLoopActionBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        const recent = await listRecentLoops(db, 5);
        const withMetrics = await attachLoopMetrics(db, recent);
        if (!cancelled) {
          setRecentLoops(withMetrics);
        }
      };

      void load();
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  const todayKey = currentDayKey();
  const activeProgress = activeLoop
    ? progressRatio(activeLoop.target_duration_seconds, elapsedSeconds)
    : 0;
  const activeTargetReached = activeLoop
    ? elapsedSeconds >= activeLoop.target_duration_seconds
    : false;

  const handleSaveIntention = async (seconds: number) => {
    if (!editingIntention) return;
    setSavingIntention(true);
    try {
      await setIntention(
        db,
        editingIntention,
        editingIntention === 'daily' ? daily?.periodKey ?? todayKey : monthly?.periodKey ?? currentMonthKey(),
        seconds
      );
      await refreshIntentions();
      setEditingIntention(null);
    } catch (error) {
      Alert.alert(
        'Could not save intention',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSavingIntention(false);
    }
  };

  const handleClearIntention = async () => {
    if (!editingIntention) return;
    setSavingIntention(true);
    try {
      await clearIntention(
        db,
        editingIntention,
        editingIntention === 'daily' ? daily?.periodKey ?? todayKey : monthly?.periodKey ?? currentMonthKey()
      );
      await refreshIntentions();
      setEditingIntention(null);
    } catch (error) {
      Alert.alert(
        'Could not clear intention',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSavingIntention(false);
    }
  };

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
        activeLoop.status === 'ACTIVE' ? 'Could not pause loop' : 'Could not resume loop',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setLoopActionBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>TODAY</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {formatDayLabel(todayKey)}
        </Text>
      </View>

      <View style={styles.intentionsRow}>
        {daily ? (
          <IntentionBar
            label="DAILY"
            summary={daily}
            onPress={() => setEditingIntention('daily')}
          />
        ) : null}
        {monthly ? (
          <IntentionBar
            label="MONTHLY"
            summary={monthly}
            onPress={() => setEditingIntention('monthly')}
          />
        ) : null}
      </View>

      {activeLoop ? (
        <View
          style={[
            styles.activeCard,
            { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Return to loop H${activeLoop.sequence_number}, ${Math.round(
              activeProgress * 100
            )}% of target complete`}
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
                  {activeLoop.status === 'PAUSED' ? 'PAUSED' : 'IN PROGRESS'}
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
              {activeLoop.focus || 'Continue your focus loop'}
            </Text>
          </Pressable>

          <View style={styles.activeFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open active loop"
              onPress={() => router.push('/loop/active')}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[styles.activeCta, { color: colors.accent }]}>
                Return to loop →
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                activeLoop.status === 'ACTIVE' ? 'Pause loop' : 'Resume loop'
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
            Ready for an hour?
          </Text>
          <Text style={[styles.startBody, { color: colors.textSecondary }]}>
            Start a loop, protect your attention, and close it with a short journal.
          </Text>
          <Button
            label="Start a loop"
            onPress={() => router.push('/loop/start')}
            style={styles.startButton}
          />
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Recent loops
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open history"
            onPress={() => router.push('/(tabs)/history')}
            hitSlop={10}
          >
            <Text style={[styles.sectionAction, { color: colors.accent }]}>
              History
            </Text>
          </Pressable>
        </View>

        {recentLoops.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title="No closed loops yet"
              message="Your first completed loop will show up here."
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

      <IntentionEditModal
        visible={editingIntention !== null}
        title={editingIntention === 'monthly' ? 'Monthly intention' : 'Daily intention'}
        initialSeconds={
          editingIntention === 'monthly'
            ? monthly?.targetSeconds ?? 0
            : daily?.targetSeconds ?? 0
        }
        presetMinutes={INTENTION_PRESETS_MINUTES}
        busy={savingIntention}
        clearLabel="Clear"
        helperText="Tap a preset to add it. Clear returns to your default target."
        onSave={(seconds) => {
          void handleSaveIntention(seconds);
        }}
        onClear={() => {
          void handleClearIntention();
        }}
        onClose={() => setEditingIntention(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginTop: spacing.sm,
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
  intentionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionAction: {
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
