import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ArchivedCapsuleRow } from './ArchivedCapsuleRow';

jest.mock('../../i18n/I18nProvider', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.text ? `${key} ${params.text}` : key,
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

describe('ArchivedCapsuleRow', () => {
  it('asks for permanent deletion of the archived capsule', async () => {
    const onDelete = jest.fn();
    await render(
      <ArchivedCapsuleRow
        text="Draft the outline"
        meta="H2 · Nov 12"
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('Draft the outline')).toBeTruthy();
    expect(screen.getByText('H2 · Nov 12')).toBeTruthy();

    await fireEvent.press(
      screen.getByLabelText('archivedCapsule.deleteA11y Draft the outline')
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
