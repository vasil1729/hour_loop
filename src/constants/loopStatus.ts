export const LOOP_STATUS = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
} as const;

export type LoopStatus = (typeof LOOP_STATUS)[keyof typeof LOOP_STATUS];

export const TASK_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const INTENTION_PERIOD = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
} as const;

export type IntentionPeriodType =
  (typeof INTENTION_PERIOD)[keyof typeof INTENTION_PERIOD];
