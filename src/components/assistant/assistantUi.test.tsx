import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

import type {
  AssistantChatMessage,
  AssistantPendingAction,
} from '../../features/assistant/assistantTypes';
import { ChatMessage } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { ActionConfirmation } from './ActionConfirmation';
import { ActionPreview } from './ActionPreview';
import { SuggestedPrompts } from './SuggestedPrompts';

let mockIsRTL = false;
let mockScheme: 'light' | 'dark' = 'dark';

jest.mock('../../i18n/I18nProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    isRTL: mockIsRTL,
  }),
}));

jest.mock('../../theme/ThemeContext', () => {
  const tokens = jest.requireActual('../../theme/tokens') as {
    palette: Record<'light' | 'dark', unknown>;
  };
  return {
    useTheme: () => ({
      colors: tokens.palette[mockScheme],
      scheme: mockScheme,
    }),
  };
});

function makeAction(
  overrides: Partial<AssistantPendingAction> = {}
): AssistantPendingAction {
  return {
    id: 'action-1',
    toolName: 'start_loop',
    args: { durationMinutes: 45 },
    description: 'Start a 45-minute loop for “Deep work”.',
    details: [
      { key: 'duration', value: '45' },
      { key: 'focus', value: 'Deep work' },
    ],
    risk: 'timer',
    targetIds: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    status: 'pending',
    ...overrides,
  };
}

const message: AssistantChatMessage = {
  id: 'message-1',
  role: 'assistant',
  content: 'You focused for 2 hours today.',
  createdAt: '2026-11-12T10:00:00.000Z',
  status: 'sent',
};

beforeEach(() => {
  mockIsRTL = false;
  mockScheme = 'dark';
});

describe('assistant UI components', () => {
  it.each(['light', 'dark'] as const)(
    'renders chat messages in %s mode',
    async (scheme) => {
      mockScheme = scheme;
      await render(<ChatMessage message={message} />);
      expect(screen.getByText(message.content)).toBeTruthy();
      expect(screen.getByText('assistant.assistant')).toBeTruthy();
    }
  );

  it('renders an explicit timer action preview', async () => {
    await render(<ActionPreview action={makeAction()} />);

    expect(
      screen.getByText('Start a 45-minute loop for “Deep work”.')
    ).toBeTruthy();
    expect(screen.getByText('assistant.actionRiskTimer')).toBeTruthy();
    expect(screen.getByText('assistant.detailDuration')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.getByText('assistant.detailFocus')).toBeTruthy();
  });

  it('never confirms an action on render and requires a press', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <ActionConfirmation
        action={makeAction()}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onDismiss={jest.fn()}
        onExpire={jest.fn()}
      />
    );

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('assistant.actionConfirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('action-1');
  });

  it('cancels without confirming', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <ActionConfirmation
        action={makeAction()}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onDismiss={jest.fn()}
        onExpire={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByText('assistant.actionCancel'));
    expect(onCancel).toHaveBeenCalledWith('action-1');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the real result only after an executed action', async () => {
    await render(
      <ActionConfirmation
        action={makeAction({
          status: 'executed',
          result: 'Started H3 for 45 minutes.',
        })}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        onDismiss={jest.fn()}
        onExpire={jest.fn()}
      />
    );

    expect(screen.getByText('Started H3 for 45 minutes.')).toBeTruthy();
    expect(screen.getByText('assistant.actionExecuted')).toBeTruthy();
    expect(screen.queryByText('assistant.actionConfirm')).toBeNull();
  });

  it('shows a safe failed state and an expired state', async () => {
    const { rerender } = await render(
      <ActionConfirmation
        action={makeAction({
          status: 'failed',
          error: 'The provider rejected the request.',
        })}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        onDismiss={jest.fn()}
        onExpire={jest.fn()}
      />
    );
    expect(screen.getByText('assistant.actionFailed')).toBeTruthy();
    expect(
      screen.getByText('The provider rejected the request.')
    ).toBeTruthy();

    await rerender(
      <ActionConfirmation
        action={makeAction({ status: 'expired' })}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        onDismiss={jest.fn()}
        onExpire={jest.fn()}
      />
    );
    expect(screen.getByText('assistant.actionExpired')).toBeTruthy();
    expect(screen.getByText('assistant.actionDismiss')).toBeTruthy();
  });

  it('offers suggested prompts as pressable actions in RTL mode', async () => {
    mockIsRTL = true;
    const onSelect = jest.fn();
    await render(<SuggestedPrompts onSelect={onSelect} />);

    await fireEvent.press(screen.getByText('assistant.suggestStart'));
    expect(onSelect).toHaveBeenCalledWith('assistant.suggestStart');
  });

  it('exposes stop generation while a request is running', async () => {
    const onStop = jest.fn();
    await render(
      <ChatComposer
        value="Start a loop"
        onChangeText={jest.fn()}
        onSend={jest.fn()}
        onStop={onStop}
        busy
      />
    );

    await fireEvent.press(screen.getByLabelText('assistant.stopA11y'));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('assistant.send')).toBeNull();
  });

  it('renders an accessible error state', async () => {
    await render(
      <ChatMessage
        message={{ ...message, content: 'Network failed.', status: 'error' }}
      />
    );
    expect(screen.getByText('Network failed.')).toBeTruthy();
    expect(screen.getByText('assistant.errorHint')).toBeTruthy();
  });
});
