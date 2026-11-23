export async function nativeSha256File(): Promise<string> {
  throw new Error('Native SHA-256 is unavailable on web.');
}
