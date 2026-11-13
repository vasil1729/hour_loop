import { classifyScope } from './scopeClassifier';
import { getScopeModelInfo } from './scopeModel';

type DatasetSample = {
  text: string;
  label: number;
  lang: string;
};

const LABEL_NAMES = [
  'IN_SCOPE',
  'OUT_OF_SCOPE',
  'MIXED',
  'AMBIGUOUS',
];
const testSamples = require('../../../../scripts/scope-classifier/test-samples.json') as DatasetSample[];

function evaluate() {
  const perLanguage = new Map<
    string,
    { total: number; exact: number; safe: number; falseAccept: number }
  >();
  let exact = 0;
  let safe = 0;
  let falseAccept = 0;
  const confusion: Record<string, Record<string, number>> = {};

  for (const sample of testSamples) {
    const expected = LABEL_NAMES[sample.label] ?? 'UNKNOWN';
    const predicted = classifyScope(sample.text).category;
    if (predicted === expected) exact += 1;
    if (expected === 'IN_SCOPE') {
      if (predicted === 'IN_SCOPE') safe += 1;
    } else if (predicted !== 'IN_SCOPE') {
      safe += 1;
    }
    if (predicted === 'IN_SCOPE' && expected !== 'IN_SCOPE') {
      falseAccept += 1;
    }
    confusion[expected] ??= {};
    confusion[expected][predicted] = (confusion[expected][predicted] ?? 0) + 1;
    if (expected === 'AMBIGUOUS' && predicted === 'IN_SCOPE') {
      console.log('AMBIGUOUS_AS_IN', JSON.stringify(sample));
    }

    const entry = perLanguage.get(sample.lang) ?? {
      total: 0,
      exact: 0,
      safe: 0,
      falseAccept: 0,
    };
    entry.total += 1;
    if (predicted === expected) entry.exact += 1;
    if (
      (expected === 'IN_SCOPE' && predicted === 'IN_SCOPE') ||
      (expected !== 'IN_SCOPE' && predicted !== 'IN_SCOPE')
    ) {
      entry.safe += 1;
    }
    if (predicted === 'IN_SCOPE' && expected !== 'IN_SCOPE') {
      entry.falseAccept += 1;
    }
    perLanguage.set(sample.lang, entry);
  }

  return {
    model: getScopeModelInfo(),
    total: testSamples.length,
    exactAccuracy: exact / testSamples.length,
    safeRoutingRate: safe / testSamples.length,
    falseAcceptRate: falseAccept / testSamples.length,
    confusion,
    perLanguage: Object.fromEntries(perLanguage),
  };
}

describe('scope classifier held-out evaluation', () => {
  it('routes held-out synthetic data safely', () => {
    const result = evaluate();
    console.log('SCOPE_EVALUATION', JSON.stringify(result, null, 2));
    expect(result.falseAcceptRate).toBe(0);
    expect(result.safeRoutingRate).toBeGreaterThanOrEqual(0.9);
    expect(result.exactAccuracy).toBeGreaterThanOrEqual(0.75);
  });
});
