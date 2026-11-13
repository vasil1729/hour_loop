import { predictScopeProbability, getScopeModelThresholds } from './scopeModel';
import {
  classifyDeterministicScope,
  isAmbiguousFragment,
  isDeicticFollowUp,
  isExplicitAppHelp,
  isNonAppExternalAction,
  isNonAppListRequest,
  isNonAppMediaRequest,
  splitScopeClauses,
} from './scopeRules';
import type {
  ScopeCategory,
  ScopeClassifyOptions,
  ScopeDecision,
} from './scopeTypes';

type SegmentDecision = {
  category: ScopeCategory;
  probability: number;
  confidence: number;
  source: 'rules' | 'model';
};

function classifySegment(text: string): SegmentDecision {
  if (
    isNonAppMediaRequest(text) ||
    isNonAppListRequest(text) ||
    isNonAppExternalAction(text)
  ) {
    return {
      category: 'OUT_OF_SCOPE',
      probability: 0,
      confidence: 1,
      source: 'rules',
    };
  }
  if (isExplicitAppHelp(text)) {
    return {
      category: 'IN_SCOPE',
      probability: 1,
      confidence: 1,
      source: 'rules',
    };
  }
  const probability = predictScopeProbability(text);
  const thresholds = getScopeModelThresholds();
  if (probability >= thresholds.inScope) {
    return {
      category: 'IN_SCOPE',
      probability,
      confidence: probability,
      source: 'model',
    };
  }
  if (probability <= thresholds.outOfScope) {
    return {
      category: 'OUT_OF_SCOPE',
      probability,
      confidence: 1 - probability,
      source: 'model',
    };
  }
  return {
    category: 'AMBIGUOUS',
    probability,
    confidence: Math.max(probability, 1 - probability),
    source: 'model',
  };
}

function decisionForSegment(segment: SegmentDecision): ScopeDecision {
  if (segment.category === 'IN_SCOPE') {
    return {
      category: 'IN_SCOPE',
      confidence: segment.confidence,
      source: segment.source,
      reason: segment.source === 'rules' ? 'app_help' : 'model',
    };
  }
  if (segment.category === 'OUT_OF_SCOPE') {
    return {
      category: 'OUT_OF_SCOPE',
      confidence: segment.confidence,
      source: segment.source,
      reason: segment.source === 'rules' ? 'non_app' : 'model',
    };
  }
  return {
    category: 'AMBIGUOUS',
    confidence: segment.confidence,
    source: segment.source,
    reason: 'confidence',
  };
}

/**
 * Application-controlled, local scope check. This function is synchronous,
 * runs entirely on-device, and never reads the API key or makes a network
 * request. On any model failure it fails closed with AMBIGUOUS, which the store
 * handles with a local clarification and no provider call.
 */
export function classifyScope(
  text: string,
  options: ScopeClassifyOptions = {}
): ScopeDecision {
  const deterministic = classifyDeterministicScope(text);
  if (deterministic) return deterministic;

  const normalized = text.trim();
  const followUp = isDeicticFollowUp(normalized);
  if (followUp) {
    if (options.previousCategory === 'IN_SCOPE') {
      return {
        category: 'IN_SCOPE',
        confidence: 0.95,
        source: 'context',
        reason: 'follow_up',
      };
    }
    return {
      category: 'AMBIGUOUS',
      confidence: 0.9,
      source: 'context',
      reason: 'follow_up',
    };
  }

  if (isAmbiguousFragment(normalized)) {
    return {
      category: 'AMBIGUOUS',
      confidence: 0.95,
      source: 'rules',
      reason: 'no_intent',
    };
  }

  try {
    const clauses = splitScopeClauses(normalized);
    if (clauses.length === 1) {
      return decisionForSegment(classifySegment(clauses[0] ?? normalized));
    }

    const segments: SegmentDecision[] = [];
    for (const clause of clauses) {
      const previous = segments[segments.length - 1];
      if (previous?.category === 'IN_SCOPE' && isDeicticFollowUp(clause)) {
        // A follow-up inside the same message ("...? Can you give me an
        // example?") inherits the immediately preceding in-scope clause only.
        segments.push({
          category: 'IN_SCOPE',
          probability: 1,
          confidence: 0.95,
          source: 'rules',
        });
      } else {
        segments.push(classifySegment(clause));
      }
    }
    const hasIn = segments.some((segment) => segment.category === 'IN_SCOPE');
    const hasOut = segments.some(
      (segment) => segment.category === 'OUT_OF_SCOPE'
    );
    const hasAmbiguous = segments.some(
      (segment) => segment.category === 'AMBIGUOUS'
    );

    if (hasIn && hasOut) {
      return {
        category: 'MIXED',
        confidence: 0.9,
        source: 'model',
        reason: 'clause_mix',
      };
    }
    if (hasOut) {
      return {
        category: hasAmbiguous ? 'MIXED' : 'OUT_OF_SCOPE',
        confidence: 0.9,
        source: 'model',
        reason: hasAmbiguous ? 'clause_mix' : 'model',
      };
    }
    if (hasIn && !hasAmbiguous) {
      return {
        category: 'IN_SCOPE',
        confidence: 0.9,
        source: 'model',
        reason: 'model',
      };
    }
    return {
      category: 'AMBIGUOUS',
      confidence: 0.9,
      source: 'model',
      reason: hasIn ? 'confidence' : 'model',
    };
  } catch {
    return {
      category: 'AMBIGUOUS',
      confidence: 0,
      source: 'fallback',
      reason: 'model_error',
    };
  }
}

/** Exposed for deterministic threshold tests without touching model internals. */
export function routeProbabilityForTests(
  probability: number,
  thresholds: { inScope: number; outOfScope: number }
): ScopeCategory {
  if (probability >= thresholds.inScope) return 'IN_SCOPE';
  if (probability <= thresholds.outOfScope) return 'OUT_OF_SCOPE';
  return 'AMBIGUOUS';
}
