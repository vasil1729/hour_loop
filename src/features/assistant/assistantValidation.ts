export type AssistantToolErrorCode =
  | 'invalid_arguments'
  | 'not_found'
  | 'forbidden'
  | 'stale';

export class AssistantToolError extends Error {
  readonly code: AssistantToolErrorCode;

  constructor(code: AssistantToolErrorCode, message: string) {
    super(message);
    this.name = 'AssistantToolError';
    this.code = code;
  }
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AssistantToolError('invalid_arguments', 'Arguments must be an object.');
  }
  return value as Record<string, unknown>;
}

export function requireString(
  record: Record<string, unknown>,
  key: string,
  options: { max: number; min?: number; trim?: boolean } = { max: 200 }
): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new AssistantToolError('invalid_arguments', `"${key}" must be a string.`);
  }
  const text = options.trim === false ? value : value.trim();
  const min = options.min ?? 1;
  if (text.length < min) {
    throw new AssistantToolError('invalid_arguments', `"${key}" is too short.`);
  }
  if (text.length > options.max) {
    throw new AssistantToolError('invalid_arguments', `"${key}" is too long.`);
  }
  return text;
}

export function optionalString(
  record: Record<string, unknown>,
  key: string,
  max: number
): string | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" must be a string or null.`
    );
  }
  const text = value.trim();
  if (text.length > max) {
    throw new AssistantToolError('invalid_arguments', `"${key}" is too long.`);
  }
  return text || null;
}

export function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  options: { min: number; max: number }
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" must be an integer.`
    );
  }
  if (value < options.min || value > options.max) {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" is outside the allowed range.`
    );
  }
  return value;
}

export function optionalBoolean(
  record: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" must be a boolean.`
    );
  }
  return value;
}

export function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T {
  const value = record[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" must be one of: ${allowed.join(', ')}.`
    );
  }
  return value as T;
}

export function optionalArray(
  record: Record<string, unknown>,
  key: string,
  maxItems: number
): unknown[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" must be an array.`
    );
  }
  if (value.length > maxItems) {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" contains too many items.`
    );
  }
  return value;
}
