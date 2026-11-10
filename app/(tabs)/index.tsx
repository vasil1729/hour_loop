import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Screen } from '../../src/components/common/Screen';
import { LoopHistoryRow } from '../../src/components/history/LoopHistoryRow';
import { currentDayKey, formatDayLabel } from '../../src/domain/shared/dateUtils';
import { formatElapsed } from '../../src/domain/timer/timerEngine';
import { listRecentLoops } from '../../src/database/repositories/loopsRepository';
import { attachLoopMetrics, type LoopWithMetrics } from '../../src/features/loops/loopMetrics';
import { useLoopStore } from '../../src/store/loopStore';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const activeLoop = useLoopStore((state) => state.activeLoop);
  const elapsedSeconds = useLoopStore((state) => state.elapsedSeconds);
  const refreshLoop = useLoopStore((state) => state.refresh);
  const [recentLoops, setRecentLoops] = useState<LoopWithMetrics[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        await refreshLoop(db);
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
    }, [db, refreshLoop])
  );

  const todayKey = currentDayKey();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>TODAY</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {formatDayLabel(todayKey)}
        </Text>
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
