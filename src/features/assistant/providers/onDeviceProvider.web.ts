import { EDGE_MODELS } from '../../../constants/edgeModels';
import {
  AssistantProviderError,
  type AssistantProvider,
} from './providerTypes';

export async function releaseOnDeviceModel(): Promise<void> {
  // Nothing to release on web.
}

export function isOnDeviceModelLoaded(): boolean {
  return false;
}

export function createOnDeviceProvider(_modelId: string): AssistantProvider {
  const unavailable = () =>
    new AssistantProviderError(
      'unsupported',
      'On-device models are available on Android builds.'
    );
  return {
    id: 'on-device',
    listModels: async () => EDGE_MODELS.map((model) => model.id),
    test: async () => {
      throw unavailable();
    },
    chat: async () => {
      throw unavailable();
    },
  };
}
