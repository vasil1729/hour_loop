import type { SQLiteDatabase } from 'expo-sqlite';

import {
  ASSISTANT_BASE_URL_KEY,
  ASSISTANT_DEFAULT_BASE_URLS,
  ASSISTANT_ENABLED_KEY,
  ASSISTANT_MODEL_KEY,
  ASSISTANT_PROVIDER_IDS,
  ASSISTANT_PROVIDER_KEY,
  ASSISTANT_WRITES_KEY,
} from '../../../constants/assistant';
import {
  getSetting,
  setSetting,
} from '../../../database/repositories/settingsRepository';
import type {
  AssistantConfig,
  AssistantProviderId,
} from '../assistantTypes';

export class AssistantConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantConfigError';
  }
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function parseProvider(value: string | null): AssistantProviderId {
  return ASSISTANT_PROVIDER_IDS.includes(value as AssistantProviderId)
    ? (value as AssistantProviderId)
    : 'groq';
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match = /^172\.(\d{1,3})\./.exec(host);
  if (match) {
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

/** Returns a normalized endpoint or throws a user-safe validation error. */
export function normalizeBaseUrl(value: string): string {
  const raw = value.trim();
  if (!raw) {
    throw new AssistantConfigError('Enter a base URL for the custom provider.');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AssistantConfigError('Enter a valid HTTP or HTTPS base URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AssistantConfigError('The base URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw new AssistantConfigError('The base URL cannot contain credentials.');
  }
  if (url.hash) {
    throw new AssistantConfigError('The base URL cannot contain a fragment.');
  }
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) {
    throw new AssistantConfigError(
      'Use HTTPS unless the endpoint is on a local network.'
    );
  }
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

export function resolveBaseUrl(config: AssistantConfig): string {
  if (config.provider === 'custom') {
    if (!config.baseUrl) {
      throw new AssistantConfigError('Enter a base URL for the custom provider.');
    }
    return normalizeBaseUrl(config.baseUrl);
  }
  return ASSISTANT_DEFAULT_BASE_URLS[config.provider];
}

export function validateAssistantConfig(config: AssistantConfig): AssistantConfig {
  const model = config.model.trim();
  const baseUrl =
    config.provider === 'custom'
      ? normalizeBaseUrl(config.baseUrl ?? '')
      : null;
  return {
    ...config,
    model,
    baseUrl,
  };
}

export async function loadAssistantConfig(
  db: SQLiteDatabase
): Promise<AssistantConfig> {
  const [enabled, provider, model, baseUrl, writesEnabled] = await Promise.all([
    getSetting(db, ASSISTANT_ENABLED_KEY),
    getSetting(db, ASSISTANT_PROVIDER_KEY),
    getSetting(db, ASSISTANT_MODEL_KEY),
    getSetting(db, ASSISTANT_BASE_URL_KEY),
    getSetting(db, ASSISTANT_WRITES_KEY),
  ]);
  return {
    enabled: parseBoolean(enabled, true),
    provider: parseProvider(provider),
    model: model?.trim() ?? '',
    baseUrl: baseUrl?.trim() || null,
    writesEnabled: parseBoolean(writesEnabled, true),
  };
}

export async function saveAssistantConfig(
  db: SQLiteDatabase,
  config: AssistantConfig
): Promise<AssistantConfig> {
  const normalized = validateAssistantConfig(config);
  await Promise.all([
    setSetting(db, ASSISTANT_ENABLED_KEY, String(normalized.enabled)),
    setSetting(db, ASSISTANT_PROVIDER_KEY, normalized.provider),
    setSetting(db, ASSISTANT_MODEL_KEY, normalized.model),
    setSetting(db, ASSISTANT_BASE_URL_KEY, normalized.baseUrl ?? ''),
    setSetting(db, ASSISTANT_WRITES_KEY, String(normalized.writesEnabled)),
  ]);
  return normalized;
}

export function assistantConfigIsUsable(config: AssistantConfig): boolean {
  if (!config.enabled || !config.model.trim()) return false;
  if (config.provider === 'custom') {
    try {
      normalizeBaseUrl(config.baseUrl ?? '');
    } catch {
      return false;
    }
  }
  return true;
}
