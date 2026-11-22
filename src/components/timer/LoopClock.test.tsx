import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { LoopClock } from './LoopClock';

jest.mock('../../i18n/I18nProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../../theme/ThemeContext', () => {
  const tokens = jest.requireActual('../../theme/tokens') as {
    palette: Record<'light' | 'dark', unknown>;
  };
  return {
    useTheme: () => ({
      colors: tokens.palette.light,
      scheme: 'light',
    }),
  };
});

describe('LoopClock', () => {
  it('shows the target time and ready state when idle', async () => {
    await render(
      <LoopClock elapsedSeconds={0} targetSeconds={3600} status="IDLE" />
    );

    expect(screen.getByText('01:00:00')).toBeTruthy();
    expect(screen.getByText('loopActive.noLoopMessage')).toBeTruthy();
  });

  it('shows elapsed time and a progress bar while running', async () => {
    await render(
      <LoopClock elapsedSeconds={300} targetSeconds={3600} status="ACTIVE" />
    );

    expect(screen.getByText('00:05:00')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('shows the reached state without pause controls', async () => {
    await render(
      <LoopClock
        elapsedSeconds={3600}
        targetSeconds={3600}
        status="COMPLETED"
      />
    );

    expect(screen.getByText('clock.reached')).toBeTruthy();
    expect(screen.queryByText('loopControls.pause')).toBeNull();
    expect(screen.queryByText('loopControls.resume')).toBeNull();
  });
});
