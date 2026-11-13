import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LoopItemCapsule } from './LoopItemCapsule';

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

describe('LoopItemCapsule pause control', () => {
  it('shows a pause action for the current capsule', async () => {
    const onTogglePause = jest.fn();
    await render(
      <LoopItemCapsule
        text="Write the outline"
        current
        onTogglePause={onTogglePause}
        onRemove={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByLabelText('loopControls.pause Write the outline'));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it('shows a resume action while the capsule is paused', async () => {
    await render(
      <LoopItemCapsule
        text="Write the outline"
        current
        paused
        onTogglePause={jest.fn()}
      />
    );

    expect(screen.getByLabelText('loopControls.resume Write the outline')).toBeTruthy();
    expect(screen.queryByLabelText('loopControls.pause Write the outline')).toBeNull();
  });

  it('does not show a pause action for non-current capsules', async () => {
    await render(<LoopItemCapsule text="Write the outline" current={false} />);

    expect(screen.queryByLabelText('loopControls.pause Write the outline')).toBeNull();
    expect(screen.queryByLabelText('loopControls.resume Write the outline')).toBeNull();
  });
});
