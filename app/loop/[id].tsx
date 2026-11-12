import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { ConfirmDialog } from '../../src/components/common/ConfirmDialog';
import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { LoopItemCapsule } from '../../src/components/loops/LoopItemCapsule';
import { LoopClock } from '../../src/components/timer/LoopClock';
import { LoopTimeline } from '../../src/components/timer/LoopTimeline';
import { formatDayLabel } from '../../src/domain/shared/dateUtils';
import { formatElapsed } from '../../src/domain/timer/timerEngine';
import type { Loop, LoopInterval, LoopItem } from '../../src/domain/types';
import { loopService } from '../../src/features/loops/loopService';
import { buildLoopTimeline } from '../../src/features/loops/loopTimeline';
import { cancelLoopNotification } from '../../src/services/notifications/notificationService';
import { useLoopStore } from '../../src/store/loopStore';
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
  const [intervals, setIntervals] = useState<LoopInterval[]>([]);
  const [items, setItems] = useState<LoopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const refreshLoop = useLoopStore((state) => state.refresh);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!loopId) {
        setLoading(false);
        return;
      }
      try {
        const [result, loopItems] = await Promise.all([
          loopService.getLoopWithElapsed(db, loopId),
          loopService.getLoopItems(db, loopId),
        ]);
        if (!cancelled) {
          setLoop(result.loop);
          setElapsedSeconds(result.elapsedSeconds);
          setIntervals(result.intervals);
          setItems(loopItems);
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

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await cancelLoopNotification(db, loop.id).catch(() => undefined);
      await loopService.deleteLoop(db, loop.id);
      await refreshLoop(db);
      setDeleteVisible(false);
      router.replace('/');
    } catch (caught) {
      Alert.alert(
        'Could not delete loop',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    } finally {
      setDeleting(false);
    }
  };

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

      <LoopClock
        loop={loop}
        elapsedSeconds={elapsedSeconds}
        targetSeconds={loop.target_duration_seconds}
      />

      <LoopTimeline events={buildLoopTimeline(loop, intervals)} />

      {items.length > 0 ? (
        <View style={styles.field}>
          <View style={styles.itemsHeader}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              CAPSULES
            </Text>
            <Text style={[styles.itemsCount, { color: colors.textSecondary }]}>
              {items.filter((item) => item.done).length}/{items.length} done
            </Text>
          </View>
          <View style={styles.capsuleWrap}>
            {items.map((item) => (
              <LoopItemCapsule
                key={item.id}
                text={item.text}
                done={item.done}
              />
            ))}
          </View>
        </View>
      ) : null}

      <JournalField label="FOCUS" value={loop.focus} />
      <JournalField label="CARRY IN" value={loop.carry_in} />
      <JournalField label="DONE" value={loop.done} />
      <JournalField label="ROLL FORWARD" value={loop.roll_forward} />
      <JournalField label="NOTE" value={loop.note} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete loop"
        disabled={deleting}
        onPress={() => setDeleteVisible(true)}
        style={({ pressed }) => [
          styles.deleteAction,
          { opacity: deleting ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.deleteText, { color: colors.danger }]}>
          Delete loop
        </Text>
      </Pressable>

      <ConfirmDialog
        visible={deleteVisible}
        title={`Delete H${loop.sequence_number}?`}
        message={`This permanently removes this loop and ${formatElapsed(
          elapsedSeconds
        )} of recorded focus time. This cannot be undone.${
          loop.status !== 'COMPLETED' ? ' The active loop will be discarded.' : ''
        }`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        destructive
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => {
          if (!deleting) setDeleteVisible(false);
        }}
      />
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
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemsCount: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  capsuleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldValue: {
    fontSize: 15,
    lineHeight: 22,
  },
  deleteAction: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
