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

describe('LoopItemCapsule actions', () => {
  it('does not render a per-capsule pause control', async () => {
    await render(<LoopItemCapsule text="Write the outline" current />);

    expect(screen.queryByLabelText('loopControls.pause')).toBeNull();
    expect(screen.queryByLabelText('loopControls.resume')).toBeNull();
  });

  it('uses the archive action label and icon when provided', async () => {
    const onRemove = jest.fn();
    await render(
      <LoopItemCapsule
        text="Write the outline"
        removeAccessibilityLabel="Archive Write the outline"
        removeIcon="archive-outline"
        onRemove={onRemove}
      />
    );

    await fireEvent.press(screen.getByLabelText('Archive Write the outline'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
