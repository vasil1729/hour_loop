type NativeFileHandle = {
  offset: number | null;
  readBytes(length: number): Uint8Array;
  close(): void;
};

type NativeFileConstructor = new (uri: string) => {
  open(): NativeFileHandle;
};

let FileConstructor: NativeFileConstructor | null = null;

/**
 * Reads a byte range through the Expo FileSystem JSI API. This avoids the
 * base64 string round-trip that makes SHA-256 over multi-hundred-megabyte
 * models far too slow on low-end Android devices.
 */
export function readNativeBytesChunk(
  uri: string,
  position: number,
  length: number
): Uint8Array {
  if (!FileConstructor) {
    // The next FileSystem API is shipped as source in Expo SDK 53, so keep the
    // require lazy and type it locally instead of pulling its source into tsc.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('expo-file-system/next') as {
      File: NativeFileConstructor;
    };
    FileConstructor = module.File;
  }
  const handle = new FileConstructor(uri).open();
  try {
    handle.offset = position;
    return handle.readBytes(length);
  } finally {
    handle.close();
  }
}
