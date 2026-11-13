import { normalizeScopeText, tokenizeScopeText } from './scopeFeatures';
import type { ScopeDecision } from './scopeTypes';

const MAX_SCOPE_INPUT_CHARS = 2000;

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|thanks|thank you|ok|okay|yes|no|yeah|nope|sure|great|good morning|good afternoon|good evening|नमस्ते|नमस्कार|हाय|हैलो|धन्यवाद|ഹായ്|നമസ്കാരം|നന്ദി)[\s!.,?…]*$/iu;

const FOLLOW_UP_PATTERNS: RegExp[] = [
  /^(?:and|what about|how about)\s+(?:the\s+)?(?:yesterday|today|previous day|last day|last week|this week|last month|this month|same|earlier)[\s!?.,…]*$/iu,
  /^(?:the\s+)?(?:previous|last|same|earlier)(?:\s+(?:one|day|week|month))?[\s!?.,…]*$/iu,
  /^(?:yesterday|today|this week|last week|this month|last month)[\s!?.,…]*$/iu,
  /^(?:show|tell|give)\s+me\s+(?:more|that|this|it|them)[\s!?.,…]*$/iu,
  /^how long\s+(?:has|have|did|does|do)\s+(?:it|that|this|they)\b[\s!?.,…]*$/iu,
  /^(?:what about|what's|what is)\s+(?:the|its)\s+(?:target|status|progress|elapsed time|time left)[\s!?.,…]*$/iu,
  /^(?:pause|resume|stop|continue|complete|finish|start)\s+(?:it|that|this)[\s!?.,…]*$/iu,
  /^(?:do|continue|go on)\b/iu,
  /^(?:same|more|and then|what about that)[\s!?.,…]*$/iu,
  /^(?:kal|pichle|pichhle|uske baare|uska|uski|wohi|wahi|aur phir)\b/iu,
  /^(?:innale|munp|athine|athil|athu pole|pinne|athu thanne)\b/iu,
  /^(?:pause|resume|complete|stop|start)\s+(?:karo|kar do|cheyyu|chey)[\s!?.,…]*$/iu,
];

const MIXED_SEPARATOR = /(?:\s+(?:and|aur|plus|और|ഒപ്പം|കൂടാതെ)\s+|\s*&\s*|\s*;\s*)/iu;

const AMBIGUOUS_SINGLE_WORDS = new Set([
  'loop',
  'focus',
  'task',
  'tasks',
  'capsule',
  'capsules',
  'timer',
  'session',
  'stats',
  'statistics',
  'help',
  'start',
  'pause',
  'resume',
  'stop',
  'complete',
  'finish',
  'more',
  'previous',
  'that',
  'this',
  'it',
  'kal',
  'innale',
  'ente',
  'mera',
  'wo',
  'athu',
  'karo',
  'cheyyu',
  'kaanikku',
  'पिछले',
  'कल',
  'मेरा',
  'वह',
  'करो',
  'दिखाओ',
]);

const AMBIGUOUS_PHRASE_PATTERN =
  /^(?:show me|tell me more|more|that one|this one|the previous one|what about that|and then|same as before|do it|this|that)[\s!?.,…]*$/iu;

const AMBIGUOUS_TOKENS = new Set([
  'loop', 'loops', 'session', 'sessions', 'focus', 'task', 'tasks',
  'capsule', 'capsules', 'timer', 'timers', 'stats', 'statistics',
  'progress', 'time', 'target', 'checklist', 'item', 'items', 'list',
  'details', 'status', 'active', 'current', 'paused', 'previous', 'last',
  'yesterday', 'today', 'week', 'month', 'more', 'one', 'my', 'our',
  'the', 'this', 'that', 'it', 'these', 'those', 'please', 'now',
  // Hinglish / Roman Hindi
  'mera', 'mere', 'kal', 'pichle', 'pichhle', 'wo', 'yeh', 'ye', 'kya',
  'kitna', 'kitne', 'ente', 'innale', 'athu', 'ithu', 'entha', 'ethra',
  // Devanagari
  'मेरा', 'मेरे', 'टास्क', 'टास्क्स', 'लूप', 'कैप्सूल', 'टाइमर',
  'फोकस', 'कल', 'पिछले', 'यह', 'वह', 'क्या', 'कितना',
  // Malayalam script
  'എന്റെ', 'ലൂപ്പ്', 'ടാസ്ക്', 'ക്യാപ്സ്യൂൾ', 'ടൈമർ', 'ഫോക്കസ്',
  'ഇന്നലെ', 'അത്', 'ഇത്', 'എന്ത്', 'എത്ര', 'കാണിക്കൂ', 'ചെയ്യൂ',
  'പറയൂ', 'തുടരൂ', 'നിർത്തൂ', 'പൂർത്തിയാക്കൂ',
]);

const FILLER_PREFIX =
  /^(?:please|could you|can you|would you|help me|i want to|kindly)\s+/iu;
const FILLER_SUFFIX = /\s+(?:please|now)[\s!?.,…]*$/iu;

function stripScopeFillers(text: string): string {
  let value = text;
  let previous = '';
  while (value !== previous) {
    previous = value;
    value = value.replace(FILLER_PREFIX, '').replace(FILLER_SUFFIX, '').trim();
  }
  return value;
}

export function isAmbiguousFragment(text: string): boolean {
  const normalized = stripScopeFillers(normalizeScopeText(text));
  const tokens = tokenizeScopeText(normalized);
  if (!tokens.length) return false;
  if (tokens.length === 1 && AMBIGUOUS_SINGLE_WORDS.has(tokens[0] ?? '')) {
    return true;
  }
  if (
    tokens.length <= 3 &&
    tokens.every((token) => AMBIGUOUS_TOKENS.has(token))
  ) {
    return true;
  }
  return AMBIGUOUS_PHRASE_PATTERN.test(normalized);
}

export function classifyDeterministicScope(
  text: string
): ScopeDecision | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      category: 'AMBIGUOUS',
      confidence: 1,
      source: 'rules',
      reason: 'empty',
    };
  }
  if (trimmed.length > MAX_SCOPE_INPUT_CHARS) {
    return {
      category: 'AMBIGUOUS',
      confidence: 1,
      source: 'rules',
      reason: 'oversized',
    };
  }
  if (tokenizeScopeText(trimmed).length === 0) {
    return {
      category: 'AMBIGUOUS',
      confidence: 1,
      source: 'rules',
      reason: 'no_intent',
    };
  }  if (GREETING_PATTERN.test(normalizeScopeText(trimmed))) {
    return {
      category: 'AMBIGUOUS',
      confidence: 1,
      source: 'rules',
      reason: 'no_intent',
    };
  }
  return null;
}

export function isDeicticFollowUp(text: string): boolean {
  const normalized = normalizeScopeText(text);
  if (!normalized || tokenizeScopeText(normalized).length > 10) return false;
  return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function splitScopeClauses(text: string): string[] {
  const segments = text
    .split(MIXED_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length <= 1) return [text.trim()];
  if (segments.length > 4) return [text.trim()];
  return segments;
}
