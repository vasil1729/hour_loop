export async function nativeSha256File(uri: string): Promise<string> {
  // Local Expo module. Keep the require lazy so Jest and web never load it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('../../../../modules/hour-loop-hash') as {
    sha256File: (value: string) => Promise<string>;
  };
  return module.sha256File(uri);
}
