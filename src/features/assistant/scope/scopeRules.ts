import { normalizeScopeText, tokenizeScopeText } from './scopeFeatures';
import type { ScopeDecision } from './scopeTypes';

const MAX_SCOPE_INPUT_CHARS = 2000;

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|thanks|thank you|ok|okay|yes|no|yeah|nope|sure|great|good morning|good afternoon|good evening|नमस्ते|नमस्कार|हाय|हैलो|धन्यवाद|ഹായ്|നമസ്കാരം|നന്ദി)[\s!.,?…]*$/iu;

/**
 * Contextual follow-ups must carry an explicit reference to the previous turn.
 *
 * Every pattern is anchored to the end of the message and either:
 * - consists only of a deictic/time reference ("what about the previous day?"),
 * - names a pronoun/object plus an action ("how do I stop it?"), or
 * - explicitly asks to continue the previous explanation ("the steps",
 *   "an example", "more detail").
 *
 * Generic sentence openers such as "do", "continue", "kal", "pinne" are
 * deliberately absent: they appear in unrelated questions too and must be
 * classified on their own content.
 */
const FOLLOW_UP_PATTERNS: RegExp[] = [
  /^(?:and|what about|how about)\s+(?:the\s+)?(?:yesterday|today|previous day|last day|last week|this week|last month|this month)[\s!?.,…]*$/iu,
  /^(?:the\s+)?(?:previous|last|same|earlier)(?:\s+(?:one|day|week|month|interval|loop|session|task))?[\s!?.,…]*$/iu,
  /^(?:yesterday|today|this week|last week|this month|last month)[\s!?.,…]*$/iu,
  /^(?:show|tell|give)\s+me\s+(?:more|that|this|it|them)[\s!?.,…]*$/iu,
  /^how long\s+(?:has|have|did|does|do)\s+(?:it|that|this|they)\b[\s!?.,…]*$/iu,
  /^(?:what about|what's|what is)\s+(?:the|its)\s+(?:target|status|progress|elapsed time|time left|next step|previous interval)[\s!?.,…]*$/iu,
  /^(?:pause|resume|stop|continue|complete|finish|start)\s+(?:it|that|this)[\s!?.,…]*$/iu,
  /^(?:can|could|would)\s+you\s+(?:explain|clarify|elaborate)(?:\s+(?:that|this|it))?(?:\s+(?:in\s+)?(?:more\s+)?detail)?[\s!?.,…]*$/iu,
  /^(?:can|could|would)\s+you\s+(?:give|show|provide)\s+me\s+(?:an?\s+)?example[\s!?.,…]*$/iu,
  /^(?:show|tell|give)\s+me\s+the\s+(?:steps|details|next\s+steps)[\s!?.,…]*$/iu,
  /^what\s+(?:happens|will\s+happen)\s+(?:when|if)\s+(?:i\s+)?(?:resume|pause|stop|complete|start|finish)\s+(?:it|that|this)[\s!?.,…]*$/iu,
  /^how\s+(?:do|can|should)\s+i\s+(?:stop|pause|resume|complete|start|finish)\s+(?:it|that|this)[\s!?.,…]*$/iu,
  // Roman Hindi explicit anaphora.
  /^(?:uske|uska|uski|iske|iska)\s+baare\s+(?:mein\s+)?(?:aur\s+)?(?:batao|bata\s+do|kuch\s+batao)[\s!?.,…]*$/iu,
  /^(?:wohi|wahi|vahi)\s+(?:dikhao|karo|chalao|batao)[\s!?.,…]*$/iu,
  /^(?:उसके|इसके|उसका|इसका)\s+बारे\s+में\s+(?:और\s+)?(?:बताओ|बता\s+दो)[\s!?.,…]*$/iu,
  /^(?:वही|यही)\s+(?:दिखाओ|करो)[\s!?.,…]*$/iu,
  /^(?:aur\s+phir|phir\s+kya|aur\s+kya)[\s!?.,…]*$/iu,
  // Malayalam explicit anaphora.
  /^(?:athine|athu|athil|athinte|ithine|ithu|ithil)\s+(?:pause|resume|stop|complete|start)(?:\s+(?:cheyyu|chey|cheyyuka))?[\s!?.,…]*$/iu,
  /^(?:athine|athu|athil|athinte|ithine|ithu|ithil)\s+(?:thudar|nirth|cheyyu|chey)(?:uka)?[\s!?.,…]*$/iu,
  /^(?:athu\s+pole|athu\s+thanne|athu\s+thanneyum)\s+(?:cheyyu|chey|kaanikku|parayu)[\s!?.,…]*$/iu,
  /^(?:അതിനെ|അത്|അതിൽ|ഇതിനെ|ഇത്|ഇതിൽ)\s*(?:പോസ്|തുടരുക|നിർത്തുക|പൂർത്തിയാക്കുക|ചെയ്യൂ|കാണിക്കൂ)[\s!?.,…]*$/iu,
  /^(?:അത്\s+പോലെ|അത്\s+തന്നെ)\s*(?:ചെയ്യൂ|കാണിക്കൂ|പറയൂ)[\s!?.,…]*$/iu,
  /^pinne\s+(?:enthu|entha)\s+(?:cheyyum|cheyyendath|cheyyanam)[\s!?.,…]*$/iu,
  // Hindi/Malayalam action follow-ups.
  /^(?:pause|resume|complete|stop|start)\s+(?:karo|kar\s+do|cheyyu|chey)[\s!?.,…]*$/iu,
];

/**
 * Small deterministic security guard. Prompt-injection attempts and requests
 * to reveal credentials are handled locally and never reach the model or the
 * provider, regardless of any prior in-scope context.
 */
const PROMPT_INJECTION_PATTERN =
  /\b(?:ignore|disregard|forget|override|bypass)\b[^\n]{0,80}\b(?:instructions?|directions?|guidelines?|prompts?|rules?|system|hour loop|api key|secret)\b/iu;
const SECRET_REVEAL_PATTERN =
  /\b(?:reveal|print|leak|expose|show)\b[^\n]{0,50}\b(?:system prompt|api key|hidden instructions?|secret key)\b/iu;
const SYSTEM_OVERRIDE_PATTERN = /\bsystem\s+override\b/iu;

const MIXED_SEPARATOR =
  /(?:\s+(?:and|aur|plus|और|ഒപ്പം|കൂടാതെ)\s+|\s*&\s*|\s*;\s*|,\s*(?:pinne|phir|then)\s+|\s+pinne\s+)/iu;

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
  'continue',
  'explain',
  'why',
  'how',
  'what',
  'when',
  'where',
  'who',
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
  /^(?:show me|show us|tell me|tell us|tell me more|more|that one|this one|the previous one|what about that|and then|same as before|do it|continue|go on|explain|why|how|what|when|where|who|can you|could you|would you|this|that)[\s!?.,…]*$/iu;

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

/**
 * Deterministic app-help detection is intentionally narrow. It only fires for
 * explicit Hour Loop terminology (or a small set of app concepts combined with
 * an action and a help/question marker) and is disabled whenever the message
 * names a different domain such as programming, music, physics or hardware.
 * This keeps recognisable in-app help local without turning app nouns into a
 * broad keyword allowlist.
 */
const HOUR_LOOP_PATTERN = /hour\s*loop/iu;

const NON_APP_CONTEXT_PATTERN =
  /\b(?:javascript|typescript|java|python|rust|golang|swift|kotlin|ruby|php|sql|html|css|programming|coding|code|algorithms?|compilers?|music|songs?|melodies?|videos?|editing|photoshop|premiere|after effects|davinci|blender|photography|cameras?|physics|biology|circuits?|relays?|interrupts?|medicines?|pharmacy|wardrobe|market research|focus groups?|feedback|for loop|while loop|roller coaster|computers?|cloud storage|phone storage|graph theory|mathematics|math|stories?|novels?|films?|movies?|video game|gaming|unity|unreal|microwaves?|ovens?|alarm clocks?|gmail|outlook|excel|spreadsheets?|pokemon|stock prices?|share prices?|valuations?|fundings?|revenues?|investors?|competitors?)\b|c\+\+|c#/iu;

const NON_APP_CONTENT_INTENT_PATTERN =
  /\b(?:jokes?|poems?|raps?|lyrics|essays?|recipes?|weather|news|capitals?|presidents?|translat(?:e|ion)|history|stock market|bitcoin|fun fact|facts? about|memes?)\b/iu;

const APP_NOUN_PATTERN =
  /\b(?:loops?|timers?|intervals?|capsules?|focus sessions?|backups?|checklists?)\b/iu;

const APP_ACTION_PATTERN =
  /\b(?:create|edit|rename|delete|pause|resume|start|stop|configure|change|make|add|remove|move|restore|backup|work|explain|set|duration|view|show|see|track)\b/iu;

const IMPERATIVE_APP_ACTION_PATTERN =
  /^(?:add|create|edit|rename|delete|pause|resume|start|stop|complete|finish|configure|change|make|remove|move|restore|backup|set|view|show|see|track)\b/iu;

const HELP_INTENT_PATTERN =
  /^(?:how|what|where|why|when|can|could|does|do|is|are|explain|tell|show|walk|guide)\b/iu;

const HELP_MARKER_PATTERN =
  /(?:kaise|engane|entha|cheyyum|karun|kare|banaye|undakkam|pattum|cheyyan|कैसे|करें|എങ്ങനെ|ചെയ്യാം|ഉണ്ടാക്കാം)/iu;

const ANAPHORIC_APP_HELP_PATTERN =
  /(?:athu|athine|athil|ithu|ithine|ithil|uske|uska|uski|wohi|wahi)[^\n]{0,60}(?:edit|pause|resume|create|start|stop|complete|cheyyan|cheyyum|cheyyu|karo|dikhao)[^\n]{0,40}(?:engane|kaise|how)/iu;

const ELLIPTICAL_APP_ACTION_PATTERN =
  /^(?:aur\s+)?(?:pause|resume|stop|complete|finish)\s+(?:kaise|kare|karun|karu|engane|cheyyam|cheyyum|cheyyan|cheyyaam)/iu;

const NON_APP_MEDIA_PATTERN =
  /^(?:pause|resume|play|stop|skip|mute|unmute|replay|restart|start)\b(?:\s+\S+){0,2}\s+(?:video|movie|song|music|track|playlist|podcast|episode|audio|film)\b/iu;

const NON_APP_LIST_PATTERN =
  /(?:shopping|grocery|groceries)\s+(?:list|checklist)/iu;

const NON_APP_EXTERNAL_ACTION_PATTERN =
  /^(?:order|book|buy|purchase|reserve|cook|bake|make me|give me|recommend|suggest|plan|translate|schedule|remind me to)\b[^\n]{0,80}\b(?:pizza|food|groceries|milk|flight|hotel|table|vacation|trip|recipe|movie|song|poem|joke|workout|diet|sandwich|cake|meeting|appointment)\b/iu;

export function isNonAppExternalAction(text: string): boolean {
  const normalized = stripScopeFillers(normalizeScopeText(text));
  if (!normalized) return false;
  return NON_APP_EXTERNAL_ACTION_PATTERN.test(normalized);
}

export function isNonAppMediaRequest(text: string): boolean {
  const normalized = normalizeScopeText(text);
  if (!normalized) return false;
  if (APP_NOUN_PATTERN.test(normalized)) return false;
  return NON_APP_MEDIA_PATTERN.test(normalized);
}

export function isNonAppListRequest(text: string): boolean {
  const normalized = normalizeScopeText(text);
  if (!normalized) return false;
  if (!NON_APP_LIST_PATTERN.test(normalized)) return false;
  // An explicit Hour Loop task/capsule/loop creation remains in scope even if
  // the object name happens to contain "shopping list".
  if (
    /\b(?:tasks?|capsules?|loops?)\b/.test(normalized) &&
    /\b(?:create|add|make|new|rename)\b/.test(normalized)
  ) {
    return false;
  }
  return true;
}

export function isExplicitAppHelp(text: string): boolean {
  const normalized = normalizeScopeText(text);
  if (!normalized) return false;
  if (NON_APP_CONTEXT_PATTERN.test(normalized)) return false;

  if (ELLIPTICAL_APP_ACTION_PATTERN.test(normalized)) return true;

  if (HOUR_LOOP_PATTERN.test(normalized)) {
    if (NON_APP_CONTENT_INTENT_PATTERN.test(normalized)) return false;
    return (
      HELP_INTENT_PATTERN.test(normalized) ||
      APP_ACTION_PATTERN.test(normalized) ||
      HELP_MARKER_PATTERN.test(normalized)
    );
  }

  if (ANAPHORIC_APP_HELP_PATTERN.test(normalized)) return true;

  return (
    APP_NOUN_PATTERN.test(normalized) &&
    APP_ACTION_PATTERN.test(normalized) &&
    (HELP_INTENT_PATTERN.test(normalized) ||
      HELP_MARKER_PATTERN.test(normalized) ||
      IMPERATIVE_APP_ACTION_PATTERN.test(normalized))
  );
}

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
  }
  if (
    PROMPT_INJECTION_PATTERN.test(trimmed) ||
    SECRET_REVEAL_PATTERN.test(trimmed) ||
    SYSTEM_OVERRIDE_PATTERN.test(trimmed)
  ) {
    return {
      category: 'OUT_OF_SCOPE',
      confidence: 1,
      source: 'rules',
      reason: 'prompt_injection',
    };
  }
  if (GREETING_PATTERN.test(normalizeScopeText(trimmed))) {
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

const PURE_FILLER_PATTERN =
  /^(?:please|thanks|thank you|ok|okay|sure|now|great)[\s!?.,…]*$/iu;

function isPureFillerClause(text: string): boolean {
  return PURE_FILLER_PATTERN.test(text.trim());
}

export function splitScopeClauses(text: string): string[] {
  // Sentence boundaries are treated as clause boundaries for mixed-intent
  // detection: "How do I create a loop? Write me a poem." must not be accepted
  // as a single in-scope app-help request.
  const prepared = text
    .replace(/\r?\n+/g, '; ')
    .replace(/([!?]+)\s+/g, '$1; ')
    .replace(/\.\s+([A-Z])/g, '.; $1');
  const segments = prepared
    .split(MIXED_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !isPureFillerClause(segment));
  if (segments.length <= 1) return [text.trim()];
  return segments;
}
