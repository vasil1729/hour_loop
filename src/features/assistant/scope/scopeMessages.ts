import type { TranslationKey } from '../../../i18n/types';
import type { ScopeCategory } from './scopeTypes';

/** Local, provider-independent response keys for non-allowed scope outcomes. */
export function scopeResponseKey(
  category: Exclude<ScopeCategory, 'IN_SCOPE'>
): TranslationKey {
  if (category === 'OUT_OF_SCOPE') return 'assistant.scopeRefusal';
  if (category === 'MIXED') return 'assistant.scopeMixed';
  return 'assistant.scopeClarification';
}
