/* eslint-disable import/first */
jest.mock('./scopeModel', () => ({
  predictScopeProbability: jest.fn(() => {
    throw new Error('model unavailable');
  }),
  getScopeModelThresholds: jest.fn(() => ({
    inScope: 0.8,
    outOfScope: 0.2,
  })),
}));

import { classifyScope } from './scopeClassifier';

describe('scope classifier fail-closed behavior', () => {
  it('allows obvious app queries without the model', () => {
    expect(classifyScope('show my focus stats').category).toBe('IN_SCOPE');
    expect(classifyScope('show my tasks').category).toBe('IN_SCOPE');
  });

  it('returns local clarification when model inference fails', () => {
    const decision = classifyScope('tell me about the roman empire');
    expect(decision.category).toBe('AMBIGUOUS');
    expect(decision.source).toBe('fallback');
    expect(decision.reason).toBe('model_error');
  });

  it('never returns IN_SCOPE for unrecognized text when the model is unavailable', () => {
    expect(classifyScope('explain quantum mechanics').category).not.toBe(
      'IN_SCOPE'
    );
    expect(classifyScope('tell me about the roman empire').category).not.toBe(
      'IN_SCOPE'
    );
  });
});
