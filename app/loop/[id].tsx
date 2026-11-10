import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { formatDayLabel } from '../../src/domain/shared/dateUtils';
import { formatElapsed } from '../../src/domain/timer/timerEngine';
import type { Loop } from '../../src/domain/types';
import { loopService } from '../../src/features/loops/loopService';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function LoopDetailScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const loopId = typeof params.id === 'string' ? params.id : undefined;

  const [loop, setLoop] = useState<Loop | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!loopId) {
        setLoading(false);
        return;
      }
      try {
        const result = await loopService.getLoopWithElapsed(db, loopId);
        if (!cancelled) {
          setLoop(result.loop);
          setElapsedSeconds(result.elapsedSeconds);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Loop not found.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [db, loopId]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !loop) {
    return (
      <Screen>
        <EmptyState title="Loop not found" message={error ?? 'This loop is unavailable.'} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.back}
      >
        <Text style={[styles.backText, { color: colors.accent }]}>‹ Back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={[styles.identifier, { color: colors.accent }]}>
          H{loop.sequence_number}
        </Text>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {formatDayLabel(loop.local_date)}
        </Text>
      </View>

      <View
        style={[
          styles.summary,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <SummaryItem label="Focused" value={formatElapsed(elapsedSeconds)} />
        <SummaryItem
          label="Target"
          value={formatElapsed(loop.target_duration_seconds)}
        />
        <SummaryItem label="Status" value={loop.status} />
      </View>

      <JournalField label="FOCUS" value={loop.focus} />
      <JournalField label="CARRY IN" value={loop.carry_in} />
      <JournalField label="DONE" value={loop.done} />
      <JournalField label="ROLL FORWARD" value={loop.roll_forward} />
      <JournalField label="NOTE" value={loop.note} />
    </Screen>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function JournalField({ label, value }: { label: string; value: string | null }) {
  const { colors } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    gap: spacing.xs,
  },
  identifier: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  date: {
    fontSize: 13,
  },
  summary: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryItem: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  fieldValue: {
    fontSize: 15,
    lineHeight: 22,
  },
});
