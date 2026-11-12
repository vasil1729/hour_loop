import { ASSISTANT_ACTION_TTL_MS } from '../../constants/assistant';
import { createId } from '../../domain/shared/id';
import type {
  AssistantActionPreview,
  AssistantPendingAction,
  AssistantTool,
  AssistantToolContext,
  AssistantToolResult,
} from './assistantTypes';

export type AssistantActionErrorCode =
  | 'expired'
  | 'already_handled'
  | 'writes_disabled';

export class AssistantActionError extends Error {
  readonly code: AssistantActionErrorCode;

  constructor(code: AssistantActionErrorCode, message: string) {
    super(message);
    this.name = 'AssistantActionError';
    this.code = code;
  }
}

/**
 * Actions that were ever handed to a mutation are never executed again for
 * this session, even if execution failed with an uncertain result. A fresh
 * action must be prepared and confirmed instead.
 */
const attemptedActionIds = new Set<string>();
const executingActionIds = new Set<string>();

export function createPendingAction(
  tool: AssistantTool,
  args: unknown,
  preview: AssistantActionPreview,
  now: number = Date.now()
): AssistantPendingAction {
  if (tool.risk === 'read') {
    throw new AssistantActionError(
      'already_handled',
      'Read tools do not need confirmation.'
    );
  }
  return {
    id: createId(),
    toolName: tool.name,
    args,
    description: preview.description,
    details: preview.details ?? [],
    risk: tool.risk,
    targetIds: preview.targetIds,
    createdAt: now,
    expiresAt: now + ASSISTANT_ACTION_TTL_MS,
    status: 'pending',
  };
}

export function isActionExpired(
  action: AssistantPendingAction,
  now: number = Date.now()
): boolean {
  return now > action.expiresAt;
}

/**
 * Executes a confirmed action exactly once. The caller must have already
 * obtained explicit native confirmation. Revalidation runs immediately before
 * the real service call to close the time-of-check/time-of-use gap.
 */
export async function executeAssistantAction(
  context: AssistantToolContext,
  tool: AssistantTool,
  action: AssistantPendingAction,
  options: { writesEnabled: boolean; now?: number } = { writesEnabled: true }
): Promise<AssistantToolResult> {
  if (!options.writesEnabled) {
    throw new AssistantActionError(
      'writes_disabled',
      'Write and timer actions are disabled in Assistant settings.'
    );
  }
  if (action.toolName !== tool.name || tool.risk === 'read') {
    throw new AssistantActionError(
      'already_handled',
      'This action does not match an allowed tool.'
    );
  }
  if (action.status !== 'pending') {
    throw new AssistantActionError(
      'already_handled',
      'This action was already handled.'
    );
  }
  if (attemptedActionIds.has(action.id)) {
    throw new AssistantActionError(
      'already_handled',
      'This action was already submitted.'
    );
  }
  if (executingActionIds.has(action.id)) {
    throw new AssistantActionError(
      'already_handled',
      'This action is already being applied.'
    );
  }
  if (isActionExpired(action, options.now)) {
    throw new AssistantActionError(
      'expired',
      'This action expired before it was confirmed.'
    );
  }

  attemptedActionIds.add(action.id);
  executingActionIds.add(action.id);
  try {
    if (tool.revalidate) {
      await tool.revalidate(context, action.args);
    }
    return await tool.execute(context, action.args);
  } finally {
    executingActionIds.delete(action.id);
  }
}
