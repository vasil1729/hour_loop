/**
 * Shared deterministic feature extraction for the local scope classifier.
 *
 * The same module is imported by the app and by the offline training script so
 * training and inference cannot drift apart. It is dependency-free, runs on
 * Hermes and the web, and never performs network or database access.
 */
export const SCOPE_FEATURE_BUCKETS = 1 << 15;
export const SCOPE_MAX_CLASSIFIER_CHARS = 400;
const MAX_TOKENS = 60;
const MAX_WORD_CHARS = 40;

const PREFIX_WORD = 'w:';
const PREFIX_BIGRAM = 'b:';
const CHAR_NGRAM_SIZES = [3, 4, 5] as const;

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function bucket(value: string): number {
  return hashString(value) % SCOPE_FEATURE_BUCKETS;
}

/** NFKC + lowercase + whitespace collapse. Safe for Devanagari/Malayalam. */
export function normalizeScopeText(text: string): string {
  let normalized = text;
  try {
    normalized = text.normalize('NFKC');
  } catch {
    // Older engines without String.normalize still get a usable normalized form.
  }
  return normalized
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hermes does not support Unicode property escapes, so tokenization uses an
 * explicit range check. The ranges cover every language currently shipped by
 * Hour Loop plus Devanagari/Hindi for the scope dataset.
 */
export function isScopeTokenCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x30 && codePoint <= 0x39) || // digits
    (codePoint >= 0x41 && codePoint <= 0x5a) || // A-Z
    (codePoint >= 0x61 && codePoint <= 0x7a) || // a-z
    codePoint === 0x5f ||
    (codePoint >= 0x00c0 && codePoint <= 0x024f) || // Latin extended
    (codePoint >= 0x0400 && codePoint <= 0x052f) || // Cyrillic
    (codePoint >= 0x0600 && codePoint <= 0x06ff) || // Arabic
    (codePoint >= 0x0750 && codePoint <= 0x077f) ||
    (codePoint >= 0x08a0 && codePoint <= 0x08ff) ||
    (codePoint >= 0x0900 && codePoint <= 0x097f) || // Devanagari
    (codePoint >= 0x0d00 && codePoint <= 0x0d7f) || // Malayalam
    (codePoint >= 0x0e00 && codePoint <= 0x0e7f) || // Thai
    (codePoint >= 0x3040 && codePoint <= 0x30ff) || // Japanese kana
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK extension A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK
    (codePoint >= 0xac00 && codePoint <= 0xd7af) // Hangul
  );
}

export function tokenizeScopeText(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isScopeTokenCodePoint(codePoint)) {
      current += character;
    } else if (current) {
      tokens.push(current);
      current = '';
      if (tokens.length >= MAX_TOKENS) return tokens;
    }
  }
  if (current && tokens.length < MAX_TOKENS) tokens.push(current);
  return tokens;
}

/**
 * Returns sorted unique hashed feature ids. Binary features are used so a
 * repeated word cannot dominate the linear model.
 */
export function extractScopeFeatures(text: string): number[] {
  const normalized = normalizeScopeText(text).slice(
    0,
    SCOPE_MAX_CLASSIFIER_CHARS
  );
  if (!normalized) return [];

  const features = new Set<number>();
  const tokens = tokenizeScopeText(normalized).slice(0, MAX_TOKENS);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    features.add(bucket(`${PREFIX_WORD}${token}`));
    if (index + 1 < tokens.length) {
      features.add(bucket(`${PREFIX_BIGRAM}${token}_${tokens[index + 1]}`));
    }
    const bounded = `<${token}>`.slice(0, MAX_WORD_CHARS + 2);
    for (const size of CHAR_NGRAM_SIZES) {
      for (let start = 0; start + size <= bounded.length; start += 1) {
        features.add(bucket(`c${size}:${bounded.slice(start, start + size)}`));
      }
    }
  }

  return Array.from(features).sort((a, b) => a - b);
}
