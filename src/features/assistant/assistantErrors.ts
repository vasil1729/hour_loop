import { localizeError, t } from '../../i18n';
import { AssistantConfigError } from './storage/assistantSettings';
import { CredentialStorageError } from './storage/credentialStorage';
import { AssistantActionError } from './assistantActionApproval';
import { AssistantToolError } from './assistantValidation';
import { AssistantProviderError } from './providers/providerTypes';

/** Maps internal failures to safe, localized text with no secrets or raw HTTP data. */
export function describeAssistantError(error: unknown): string {
  if (error instanceof AssistantProviderError) {
    switch (error.code) {
      case 'auth':
        return t('assistant.errorAuth');
      case 'rate_limit':
        return t('assistant.errorRateLimit');
      case 'server':
        return t('assistant.errorServer');
      case 'timeout':
        return t('assistant.errorTimeout');
      case 'network':
        return t('assistant.errorNetwork');
      case 'cancelled':
        return t('assistant.errorCancelled');
      case 'malformed':
        return t('assistant.errorMalformed');
      case 'unsupported':
        return t('assistant.errorUnsupported');
      case 'config':
        return t('assistant.errorConfig');
      case 'request':
        return t('assistant.errorRequest');
    }
  }
  if (error instanceof AssistantActionError) {
    if (error.code === 'expired') return t('assistant.actionExpired');
    if (error.code === 'writes_disabled') {
      return t('assistant.writesDisabled');
    }
    return t('assistant.errorGeneric');
  }
  if (error instanceof AssistantConfigError) {
    return t('assistant.errorConfig');
  }
  if (error instanceof CredentialStorageError) {
    return t('assistant.errorCredentials');
  }
  if (error instanceof AssistantToolError) {
    return t('assistant.errorRequest');
  }
  if (error instanceof Error) {
    const safeServiceErrors = new Set([
      'LoopAlreadyActiveError',
      'LoopTaskNotSubtaskError',
      'LoopNotFoundError',
      'LoopItemNotFoundError',
      'LoopTaskNotFoundError',
      'InvalidStateTransitionError',
      'TaskCycleError',
    ]);
    if (safeServiceErrors.has(error.name)) {
      return localizeError(error, 'assistant.errorGeneric');
    }
  }
  return t('assistant.errorGeneric');
}
