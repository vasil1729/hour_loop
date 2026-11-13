import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { LoopControls } from './LoopControls';

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

const noop = jest.fn();

describe('LoopControls resume availability', () => {
  it('hides resume when there is no capsule to resume', async () => {
    await render(
      <LoopControls
        status="PAUSED"
        canResume={false}
        onPause={noop}
        onResume={noop}
        onStop={noop}
        onMinimize={noop}
      />
    );

    expect(screen.queryByText('loopControls.resume')).toBeNull();
    expect(screen.getByText('loopControls.stop')).toBeTruthy();
  });

  it('shows resume when a capsule is available', async () => {
    await render(
      <LoopControls
        status="PAUSED"
        onPause={noop}
        onResume={noop}
        onStop={noop}
        onMinimize={noop}
      />
    );

    expect(screen.getByText('loopControls.resume')).toBeTruthy();
  });
});
