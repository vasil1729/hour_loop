import React from 'react';
import { render, screen } from '@testing-library/react-native';

import type { Loop, LoopItem } from '../../domain/types';
import { LoopHistoryRow } from './LoopHistoryRow';

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

const loop: Loop = {
  id: 'loop-2',
  sequence_number: 2,
  local_date: '2026-11-22',
  focus: null,
  carry_in: null,
  done: null,
  roll_forward: null,
  roll_forward_task_id: null,
  note: null,
  task_id: null,
  target_duration_seconds: 3600,
  status: 'COMPLETED',
  started_at: '2026-11-22T10:00:00.000Z',
  stopped_at: '2026-11-22T11:00:00.000Z',
  created_at: '2026-11-22T10:00:00.000Z',
  updated_at: '2026-11-22T11:00:00.000Z',
};

const capsules: LoopItem[] = [
  {
    id: 'item-1',
    loop_id: 'loop-2',
    text: 'Research',
    done: false,
    current: false,
    archived_at: null,
    sort_order: 0,
    carried_from_item_id: null,
    created_at: '2026-11-22T10:00:00.000Z',
    updated_at: '2026-11-22T10:00:00.000Z',
  },
];

describe('LoopHistoryRow', () => {
  it('uses a time-first hour label and lists capsules as secondary tags', async () => {
    await render(
      <LoopHistoryRow loop={loop} elapsedSeconds={3600} capsules={capsules} />
    );

    expect(screen.getByText('loopRow.hourLabel')).toBeTruthy();
    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.queryByText('loopRow.untitled')).toBeNull();
  });
});
