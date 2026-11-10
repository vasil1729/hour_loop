/**
 * RFC 4122 v4 identifier. Uses the platform crypto implementation when
 * available and falls back to Math.random for local-only identifiers.
 */
export function createId(): string {
  const cryptoObject = (
    globalThis as unknown as {
      crypto?: { randomUUID?: () => string };
    }
  ).crypto;

  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
