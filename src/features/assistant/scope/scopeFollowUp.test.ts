import { classifyScope } from './scopeClassifier';

/**
 * One representative message for every contextual follow-up pattern, plus the
 * boundary phrases that were found to be model false-accepts/false-rejects
 * during adversarial QA.
 *
 * With no context, a follow-up must be AMBIGUOUS. With an in-scope previous
 * turn it may inherit relevance. With any other previous category it must not
 * become IN_SCOPE.
 */
const FOLLOW_UP_CASES = [
  'What about the previous day?',
  'Previous.',
  'Last week.',
  'Yesterday.',
  'Today.',
  'Show me more.',
  'How long has it been?',
  'How long has it been running?',
  'How long did it take?',
  'What is its status?',
  'Pause it.',
  'Resume it.',
  'Can you explain that in more detail?',
  'Can you give me an example?',
  'Give me an example.',
  'Show me an example.',
  'Show me the steps.',
  'What happens when I resume it?',
  'How do I stop it?',
  'What happens next?',
  "What's next?",
  'uske baare mein aur batao',
  'wohi dikhao',
  'उसके बारे में और बताओ',
  'वही दिखाओ',
  'aur phir',
  'athine pause cheyyu',
  'athine thudaruka',
  'athu pole cheyyu',
  'അതിനെ പോസ് ചെയ്യൂ',
  'അത് തന്നെ കാണിക്കൂ',
  'pinne enthu cheyyum',
  'pause karo',
  'Tell me more.',
  'What about last week?',
] as const;

describe('contextual follow-up pattern matrix', () => {
  it.each(FOLLOW_UP_CASES)(
    '%s is local without context',
    (text) => {
      expect(classifyScope(text).category).toBe('AMBIGUOUS');
    }
  );

  it.each(FOLLOW_UP_CASES)(
    '%s inherits only from IN_SCOPE',
    (text) => {
      expect(
        classifyScope(text, { previousCategory: 'IN_SCOPE' }).category
      ).toBe('IN_SCOPE');
      for (const previousCategory of [
        'OUT_OF_SCOPE',
        'MIXED',
        'AMBIGUOUS',
      ] as const) {
        expect(
          classifyScope(text, { previousCategory }).category
        ).toBe('AMBIGUOUS');
      }
    }
  );
});
