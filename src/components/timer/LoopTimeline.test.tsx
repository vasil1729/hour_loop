import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { LoopEvent } from '../../features/loops/loopTimeline';
import { LoopTimeline } from './LoopTimeline';

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

const events: LoopEvent[] = [
  { kind: 'STARTED', at: '2026-11-22T10:00:00.000Z' },
  { kind: 'PAUSED', at: '2026-11-22T10:10:00.000Z' },
  { kind: 'RESUMED', at: '2026-11-22T10:15:00.000Z' },
];

describe('LoopTimeline', () => {
  it('starts collapsed and expands on press', async () => {
    await render(<LoopTimeline events={events} collapsible />);

    expect(screen.getByText('timeline.title')).toBeTruthy();
    expect(screen.queryByText('timeline.started')).toBeNull();

    await fireEvent.press(screen.getByText('timeline.title'));

    expect(screen.getByText('timeline.started')).toBeTruthy();
    expect(screen.getByText('timeline.paused')).toBeTruthy();
  });

  it('shows the timeline expanded when not collapsible', async () => {
    await render(<LoopTimeline events={events} />);

    expect(screen.getByText('timeline.started')).toBeTruthy();
  });
});
