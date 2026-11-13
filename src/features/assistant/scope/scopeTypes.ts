export type ScopeCategory =
  | 'IN_SCOPE'
  | 'OUT_OF_SCOPE'
  | 'MIXED'
  | 'AMBIGUOUS';

export type ScopeDecisionSource =
  | 'rules'
  | 'model'
  | 'context'
  | 'fallback';

export type ScopeDecisionReason =
  | 'empty'
  | 'oversized'
  | 'no_intent'
  | 'follow_up'
  | 'app_help'
  | 'non_app'
  | 'model'
  | 'confidence'
  | 'clause_mix'
  | 'prompt_injection'
  | 'model_error';

export type ScopeDecision = {
  category: ScopeCategory;
  confidence: number;
  source: ScopeDecisionSource;
  reason: ScopeDecisionReason;
};

export type ScopeClassifyOptions = {
  previousCategory?: ScopeCategory | null;
};

export type ScopeModelInfo = {
  version: number;
  featureBuckets: number;
  modelBytes: number;
  trainingSamples: number;
};
