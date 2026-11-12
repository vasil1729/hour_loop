import type {
  AssistantProviderId,
  ProviderRequest,
  ProviderResponse,
} from '../assistantTypes';

export type AssistantProviderErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'network'
  | 'cancelled'
  | 'malformed'
  | 'request'
  | 'unsupported'
  | 'config';

export class AssistantProviderError extends Error {
  readonly code: AssistantProviderErrorCode;

  constructor(code: AssistantProviderErrorCode, message: string) {
    super(message);
    this.name = 'AssistantProviderError';
    this.code = code;
  }
}

export type AssistantProvider = {
  id: AssistantProviderId;
  chat: (request: ProviderRequest) => Promise<ProviderResponse>;
  test: (signal?: AbortSignal) => Promise<void>;
  listModels?: (signal?: AbortSignal) => Promise<string[]>;
};
