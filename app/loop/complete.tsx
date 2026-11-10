import React, { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { EmptyState } from '../../src/components/common/EmptyState';
import { LoadingScreen } from '../../src/components/common/LoadingScreen';
import { Screen } from '../../src/components/common/Screen';
import { formatDayLabel } from '../../src/domain/shared/dateUtils';
import { formatDurationCompact } from '../../src/domain/timer/timerEngine';
import type { Loop } from '../../src/domain/types';
import { loopService } from '../../src/features/loops/loopService';
import { useLoopStore } from '../../src/store/loopStore';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

export default function CompleteLoopScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ loopId?: string }>();
  const loopId = typeof params.loopId === 'string' ? params.loopId : undefined;
  const refreshLoop = useLoopStore((state) => state.refresh);

  const [loop, setLoop] = useState<Loop | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focus, setFocus] = useState('');
  const [carryIn, setCarryIn] = useState('');
  const [done, setDone] = useState('');
  const [rollForward, setRollForward] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!loopId) {
        setLoading(false);
        return;
      }
      try {
        const result = await loopService.getLoopWithElapsed(db, loopId);
        if (cancelled) return;
        setLoop(result.loop);
        setElapsedSeconds(result.elapsedSeconds);
        setFocus(result.loop.focus ?? '');
        setCarryIn(result.loop.carry_in ?? '');
        setDone(result.loop.done ?? '');
        setRollForward(result.loop.roll_forward ?? '');
        setNote(result.loop.note ?? '');
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Loop not found.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [db, loopId]);

  const handleKeepLooping = async () => {
    if (!loop) return;
    if (loop.status === 'PAUSED') {
      setBusy(true);
      try {
        await loopService.resumeLoop(db, loop.id);
        await refreshLoop(db);
      } catch (caught) {
        Alert.alert(
          'Could not resume loop',
          caught instanceof Error ? caught.message : 'Please try again.'
        );
        return;
      } finally {
        setBusy(false);
      }
    }
    router.back();
  };

  const handleSave = async () => {
    if (!loop) return;
    if (loop.status === 'COMPLETED') {
      router.replace('/(tabs)');
      return;
    }

    setBusy(true);
    try {
      await loopService.completeLoop(db, loop.id, {
        focus,
        carryIn,
        done,
        rollForward,
        note,
      });
      await refreshLoop(db);
      router.replace('/(tabs)');
    } catch (caught) {
      Alert.alert(
        'Could not close loop',
        caught instanceof Error ? caught.message : 'Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Preparing your journal…" />;
  }

  if (error || !loop) {
    return (
      <Screen>
        <EmptyState
          title="Loop not found"
          message={error ?? 'This loop is no longer available.'}
          action={
            <Button label="Back to Today" onPress={() => router.replace('/(tabs)')} />
          }
        />
      </Screen>
    );
  }

  const readOnly = loop.status === 'COMPLETED';

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
          CLOSING LOOP
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          H{loop.sequence_number} · {formatDurationCompact(elapsedSeconds)}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {formatDayLabel(loop.local_date)}
        </Text>
      </View>

      {readOnly ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          ]}
        >
          <Text style={[styles.noticeText, { color: colors.accent }]}>
            This loop is already complete. Its journal is shown below.
          </Text>
        </View>
      ) : null}

      <Field
        label="FOCUS"
        value={focus}
        onChangeText={setFocus}
        placeholder="What was this loop for?"
        editable={!readOnly}
        multiline
      />
      <Field
        label="CARRY IN"
        value={carryIn}
        onChangeText={setCarryIn}
        placeholder="What you brought into the loop"
        editable={!readOnly}
        multiline
      />
      <Field
        label="DONE"
        value={done}
        onChangeText={setDone}
        placeholder="What did you actually accomplish?"
        editable={!readOnly}
        multiline
      />
      <Field
        label="ROLL FORWARD"
        value={rollForward}
        onChangeText={setRollForward}
        placeholder="What should the next loop pick up?"
        editable={!readOnly}
        multiline
      />
      <Field
        label="NOTE"
        value={note}
        onChangeText={setNote}
        placeholder="Anything worth remembering?"
        editable={!readOnly}
        multiline
      />

      <Button
        label={readOnly ? 'Back to Today' : 'Save & close loop'}
        onPress={() => {
          void handleSave();
        }}
        loading={busy}
      />
      {!readOnly ? (
        <Button
          label="Keep looping"
          variant="ghost"
          onPress={() => {
            void handleKeepLooping();
          }}
          disabled={busy}
        />
      ) : null}
    </Screen>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  editable: boolean;
  multiline?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  editable,
  multiline = false,
}: FieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        editable={editable}
        multiline={multiline}
        maxLength={2000}
        style={[
          styles.input,
          multiline ? styles.multiline : styles.singleLine,
          {
            color: editable ? colors.text : colors.textSecondary,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
  },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  multiline: {
    minHeight: 78,
    lineHeight: 21,
  },
  singleLine: {
    minHeight: 50,
  },
});
