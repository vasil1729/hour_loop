import type { Loop, LoopInterval } from '../../domain/types';

export type LoopEventKind = 'STARTED' | 'PAUSED' | 'RESUMED' | 'STOPPED';

export type LoopEvent = {
  kind: LoopEventKind;
  at: string;
};

export type LoopTimelineOptions = {
  /** The loop is being closed, so its final pause represents the stop action. */
  closing?: boolean;
};

/**
 * Derive the start, pause, resume, and stop log from persisted intervals.
 * The final interval end is a stop once the loop is completed or being closed;
 * otherwise it is a pause.
 */
export function buildLoopTimeline(
  loop: Loop,
  intervals: LoopInterval[],
  options: LoopTimelineOptions = {}
): LoopEvent[] {
  const ordered = [...intervals].sort((a, b) =>
    a.started_at.localeCompare(b.started_at)
  );
  const finished = loop.status === 'COMPLETED' || options.closing === true;
  const events: LoopEvent[] = [];

  ordered.forEach((interval, index) => {
    events.push({
      kind: index === 0 ? 'STARTED' : 'RESUMED',
      at: interval.started_at,
    });

    if (!interval.ended_at) return;

    const isLastInterval = index === ordered.length - 1;
    events.push({
      kind: isLastInterval && finished ? 'STOPPED' : 'PAUSED',
      at: interval.ended_at,
    });
  });

  if (events.length === 0) {
    events.push({ kind: 'STARTED', at: loop.started_at });
  }

  if (
    finished &&
    loop.stopped_at &&
    events[events.length - 1]?.kind !== 'STOPPED'
  ) {
    events.push({ kind: 'STOPPED', at: loop.stopped_at });
  }

  return events;
}
