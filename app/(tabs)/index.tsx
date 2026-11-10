import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Screen } from '../../src/components/common/Screen';
import { LoopHistoryRow } from '../../src/components/history/LoopHistoryRow';
import { IntentionBar } from '../../src/components/intentions/IntentionBar';
import { IntentionEditModal } from '../../src/components/intentions/IntentionEditModal';
import {
  currentDayKey,
  currentMonthKey,
  formatDayLabel,
} from '../../src/domain/shared/dateUtils';
import { formatElapsed } from '../../src/domain/timer/timerEngine';
import { listRecentLoops } from '../../src/database/repositories/loopsRepository';
import { attachLoopMetrics, type LoopWithMetrics } from '../../src/features/loops/loopMetrics';
import {
  clearIntention,
  setIntention,
} from '../../src/features/intentions/intentionsService';
import { useActiveLoop } from '../../src/hooks/useActiveLoop';
import { useIntentions } from '../../src/hooks/useIntentions';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { activeLoop, elapsedSeconds } = useActiveLoop();
  const [recentLoops, setRecentLoops] = useState<LoopWithMetrics[]>([]);
  const { daily, monthly, refresh: refreshIntentions } = useIntentions();
  const [editingIntention, setEditingIntention] = useState<'daily' | 'monthly' | null>(
    null
  );
  const [savingIntention, setSavingIntention] = useState(false);

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Return to loop H${activeLoop.sequence_number}`}
          onPress={() => router.push('/loop/active')}
          style={({ pressed }) => [
            styles.activeCard,
            {
              backgroundColor: colors.accentSoft,
              borderColor: colors.accent,
              opacity: pressed ? 0.85 : 1,
            },
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
          <Text
            numberOfLines={2}
            style={[styles.activeFocus, { color: colors.text }]}
          >
            {activeLoop.focus || 'Continue your focus loop'}
          </Text>
          <Text style={[styles.activeCta, { color: colors.accent }]}>
            Return to loop →
          </Text>
        </Pressable>
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
            ? monthly?.intention?.target_duration_seconds ?? null
            : daily?.intention?.target_duration_seconds ?? null
        }
        presetMinutes={
          editingIntention === 'monthly'
            ? [600, 1200, 2400, 3600]
            : [30, 60, 90, 120]
        }
        busy={savingIntention}
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
  activeFocus: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '600',
  },
  activeCta: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs,
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
