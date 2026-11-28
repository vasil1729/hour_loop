import { currentDayKey } from '../../domain/shared/dateUtils';
import { AssistantToolError, requireObject } from './assistantValidation';

export type AssistantPeriod = 'day' | 'week' | 'month';

export type AssistantPeriodRequest = {
  period: AssistantPeriod;
  anchorDate?: string;
};

const PERIOD_ALIASES: Record<string, { period: AssistantPeriod; days?: number; months?: number }> = {
  day: { period: 'day' },
  daily: { period: 'day' },
  today: { period: 'day' },
  yesterday: { period: 'day', days: -1 },
  'this day': { period: 'day' },
  'current day': { period: 'day' },
  week: { period: 'week' },
  weekly: { period: 'week' },
  'this week': { period: 'week' },
  'current week': { period: 'week' },
  'last week': { period: 'week', days: -7 },
  month: { period: 'month' },
  monthly: { period: 'month' },
  'this month': { period: 'month' },
  'current month': { period: 'month' },
  'last month': { period: 'month', months: -1 },
};

function shiftDayKey(dayKey: string, days: number): string {
  const parts = dayKey.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonthKey(dayKey: string, months: number): string {
  const parts = dayKey.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}

function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasFor(value: string) {
  return PERIOD_ALIASES[normalizeToken(value)] ?? null;
}

export function parsePeriodRequest<T extends AssistantPeriod>(
  value: unknown,
  anchorValue: unknown,
  allowed: readonly T[],
  today = currentDayKey()
): { period: T; anchorDate?: string } {
  const raw = typeof value === 'string' ? value.trim() : '';
  const alias = raw ? aliasFor(raw) : null;
  if (!alias || !allowed.includes(alias.period as T)) {
    throw new AssistantToolError(
      'invalid_arguments',
      `"period" must be one of: ${allowed.join(', ')}.`
    );
  }

  let anchorDate: string | undefined;
  if (typeof anchorValue === 'string' && anchorValue.trim()) {
    const candidate = anchorValue.trim();
    const anchorAlias = aliasFor(candidate);
    if (isDayKey(candidate)) {
      anchorDate = candidate;
    } else if (anchorAlias) {
      anchorDate = today;
      if (anchorAlias.days) anchorDate = shiftDayKey(anchorDate, anchorAlias.days);
      if (anchorAlias.months) {
        anchorDate = shiftMonthKey(anchorDate, anchorAlias.months);
      }
    } else {
      throw new AssistantToolError(
        'invalid_arguments',
        '"anchorDate" must use YYYY-MM-DD.'
      );
    }
  } else if (alias.days || alias.months) {
    anchorDate = today;
    if (alias.days) anchorDate = shiftDayKey(anchorDate, alias.days);
    if (alias.months) anchorDate = shiftMonthKey(anchorDate, alias.months);
  }

  return { period: alias.period as T, anchorDate };
}

export function optionalIntegerLike(
  record: Record<string, unknown>,
  key: string,
  options: { min: number; max: number }
): number | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value < options.min || value > options.max) {
      throw new AssistantToolError(
        'invalid_arguments',
        `"${key}" is outside the allowed range.`
      );
    }
    return value;
  }
  if (typeof value === 'string') {
    const text = normalizeToken(value);
    const hours = text.match(/^(\d+)\s*h(?:ours?|rs?)?(?:\s*(\d+))?$/);
    const minutes = text.match(/^(\d+)(?:\s*(?:minutes?|mins?|m))?$/);
    let parsed: number | undefined;
    if (hours) {
      parsed = Number(hours[1]) * 60 + Number(hours[2] ?? 0);
    } else if (minutes) {
      parsed = Number(minutes[1]);
    }
    if (parsed !== undefined && parsed >= options.min && parsed <= options.max) {
      return parsed;
    }
  }
  throw new AssistantToolError(
    'invalid_arguments',
    `"${key}" must be an integer between ${options.min} and ${options.max}.`
  );
}

export function optionalSequence(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/^(?:h|loop\s*)?(\d+)$/i);
    if (match) return Number(match[1]);
  }
  throw new AssistantToolError(
    'invalid_arguments',
    `"${key}" must be a loop number such as 3 or H3.`
  );
}

export function optionalJournalText(
  record: Record<string, unknown>,
  key: string,
  max = 2000
): string | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.length > max) {
      throw new AssistantToolError('invalid_arguments', `"${key}" is too long.`);
    }
    return text || null;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return null;
  throw new AssistantToolError(
    'invalid_arguments',
    `"${key}" must be a string or null.`
  );
}

export function parseStringItems(
  record: Record<string, unknown>,
  key: string,
  maxItems = 10,
  maxText = 200
): { text: string }[] {
  const raw = record[key];
  if (raw === undefined || raw === null) return [];
  const entries = Array.isArray(raw) ? raw : [raw];
  if (entries.length > maxItems) {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" contains too many items.`
    );
  }
  return entries.map((entry) => {
    let text: unknown;
    if (typeof entry === 'string') {
      text = entry;
    } else if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      const item = entry as Record<string, unknown>;
      text = item.text ?? item.title ?? item.name;
    }
    if (typeof text !== 'string' || !text.trim()) {
      throw new AssistantToolError(
        'invalid_arguments',
        `"${key}" entries must contain text.`
      );
    }
    const trimmed = text.trim();
    if (trimmed.length > maxText) {
      throw new AssistantToolError(
        'invalid_arguments',
        `"${key}" entries are too long.`
      );
    }
    return { text: trimmed };
  });
}

export function optionalTitle(
  record: Record<string, unknown>,
  key: string,
  max = 200
): string | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AssistantToolError(
      'invalid_arguments',
      `"${key}" must be a string.`
    );
  }
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) {
    throw new AssistantToolError('invalid_arguments', `"${key}" is too long.`);
  }
  return text;
}

export function requireObjectArg(args: unknown): Record<string, unknown> {
  return requireObject(args);
}
