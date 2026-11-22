import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { LoopControls } from './LoopControls';

jest.mock('../../i18n/I18nProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const noop = jest.fn();

describe('LoopControls', () => {
  it('shows pause and stop while the loop is running', async () => {
    await render(
      <LoopControls
        status="ACTIVE"
        onPause={noop}
        onResume={noop}
        onStop={noop}
      />
    );

    expect(screen.getByText('loopControls.pause')).toBeTruthy();
    expect(screen.getByText('loopControls.stop')).toBeTruthy();
    expect(screen.queryByText('loopControls.resume')).toBeNull();
  });

  it('shows resume and stop while paused', async () => {
    await render(
      <LoopControls
        status="PAUSED"
        onPause={noop}
        onResume={noop}
        onStop={noop}
      />
    );

    expect(screen.getByText('loopControls.resume')).toBeTruthy();
    expect(screen.getByText('loopControls.stop')).toBeTruthy();
    expect(screen.queryByText('loopControls.pause')).toBeNull();
  });

  it('shows only close after the target is reached', async () => {
    await render(
      <LoopControls
        status="PAUSED"
        targetReached
        onPause={noop}
        onResume={noop}
        onStop={noop}
      />
    );

    expect(screen.getByText('loopControls.close')).toBeTruthy();
    expect(screen.queryByText('loopControls.resume')).toBeNull();
  });
});
