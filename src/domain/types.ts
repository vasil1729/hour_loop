import type { IntentionPeriodType, LoopStatus, TaskStatus } from '../constants/loopStatus';

export type Loop = {
  id: string;
  sequence_number: number;
  local_date: string;
  focus: string | null;
  carry_in: string | null;
  done: string | null;
  roll_forward: string | null;
  roll_forward_task_id: string | null;
  note: string | null;
  task_id: string | null;
  target_duration_seconds: number;
  status: LoopStatus;
  started_at: string;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LoopInterval = {
  id: string;
  loop_id: string;
  started_at: string;
  ended_at: string | null;
  time_zone: string;
  created_at: string;
};

export type LoopItem = {
  id: string;
  loop_id: string;
  text: string;
  done: boolean;
  current: boolean;
  sort_order: number;
  carried_from_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LoopItemInterval = {
  id: string;
  loop_id: string;
  item_id: string;
  started_at: string;
  ended_at: string | null;
  time_zone: string;
  created_at: string;
};

export type Task = {
  id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
};

export type Intention = {
  id: string;
  period_type: IntentionPeriodType;
  period_key: string;
  target_duration_seconds: number;
  created_at: string;
  updated_at: string;
};

export type Setting = {
  key: string;
  value: string;
  updated_at: string;
};

export type DayAllocation = Record<string, number>;

export type MonthAllocation = Record<string, number>;
