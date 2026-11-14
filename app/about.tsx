import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Screen } from '../src/components/common/Screen';
import { useTranslation } from '../src/i18n/I18nProvider';
import { useTheme } from '../src/theme/ThemeContext';
import { radius, spacing } from '../src/theme/tokens';

type FlowStepProps = {
  label: string;
  detail: string;
  tone: 'task' | 'taskCapsule' | 'loop' | 'capsule';
};

function FlowStep({ label, detail, tone }: FlowStepProps) {
  const { colors } = useTheme();
  const background =
    tone === 'task'
      ? colors.surfaceAlt
      : tone === 'loop'
        ? colors.accentSoft
        : colors.surface;
  const border = tone === 'loop' ? colors.accent : colors.border;

  return (
    <View style={[styles.flowStep, { backgroundColor: background, borderColor: border }]}>
      <Text style={[styles.flowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.flowDetail, { color: colors.text }]}>{detail}</Text>
    </View>
  );
}

function Arrow() {
  const { colors } = useTheme();
  return (
    <View style={styles.arrow}>
      <Ionicons name="arrow-down" size={18} color={colors.textSecondary} />
    </View>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.ruleRow}>
      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
      <Text style={[styles.ruleText, { color: colors.text }]}>{children}</Text>
    </View>
  );
}

export default function AboutScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, isRTL } = useTranslation();

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Ionicons
            name={isRTL ? 'chevron-forward' : 'chevron-back'}
            size={24}
            color={colors.text}
          />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          How Hour Loop works
        </Text>
        <View style={styles.iconButton} />
      </View>

      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Hour Loop uses four simple ideas. They are easy to mix up at first, so
        here is how they fit together.
      </Text>

      <View
        style={[
          styles.flowCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <FlowStep
          label="TASK"
          detail="A big container, like an epic or a user story. It groups related work but does not run by itself."
          tone="task"
        />
        <Arrow />
        <FlowStep
          label="TASK CAPSULE"
          detail="An actionable subtask inside a task. This is what you select when you start a loop."
          tone="taskCapsule"
        />
        <Arrow />
        <FlowStep
          label="LOOP"
          detail="A bounded focus session: H1, H2, H3… You can pause, resume, and close it with a journal."
          tone="loop"
        />
        <Arrow />
        <FlowStep
          label="CAPSULES"
          detail="The small steps inside a loop. Add, remove, and tick them off while you focus."
          tone="capsule"
        />
      </View>

      <View style={[styles.callout, { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.calloutTitle, { color: colors.accent }]}>
          The one-sentence difference
        </Text>
        <Text style={[styles.calloutText, { color: colors.text }]}>
          A task capsule is what you choose to work on; a capsule is a step you
          tick off during the loop.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          A typical flow
        </Text>
        <Text style={[styles.example, { color: colors.textSecondary }]}>
          1. Create a task: “Launch website”.{'\n'}
          2. Add a task capsule: “Write landing page copy”.{'\n'}
          3. Start a loop on that task capsule.{'\n'}
          4. Add capsules: “Draft headline”, “Write hero section”, “Review CTA”.{'\n'}
          5. Close the loop. Completed capsules stay under Completed; unfinished
          ones can be carried into the next loop.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Loose capsules
        </Text>
        <Text style={[styles.example, { color: colors.textSecondary }]}>
          If you start a loop without a task capsule, its capsules are loose.
          They appear in Tasks under “Loose capsules”. You can also add a loose
          capsule directly from the Tasks screen without creating a task or a
          loop.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Rules of thumb
        </Text>
        <Rule>Tasks do not run; task capsules do.</Rule>
        <Rule>Only one loop can run at a time.</Rule>
        <Rule>A loop can hold many capsules; each capsule belongs to one loop.</Rule>
        <Rule>Completing a capsule does not automatically complete the task capsule.</Rule>
        <Rule>Completed capsules move to the completed list instead of disappearing.</Rule>
      </View>

      <View
        style={[
          styles.supportCard,
          { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Free and open source
        </Text>
        <Text style={[styles.example, { color: colors.textSecondary }]}>
          Hour Loop is licensed under AGPL-3.0-or-later. The source stays open,
          and you can always build it yourself. A future Play Store build may
          include a small, non-intrusive ad to support development. Ads will
          never appear inside a running loop.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  intro: {
    fontSize: 15,
    lineHeight: 22,
  },
  flowCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  flowStep: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  flowLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  flowDetail: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  arrow: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  callout: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  calloutTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  calloutText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  example: {
    fontSize: 14,
    lineHeight: 22,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  supportCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
