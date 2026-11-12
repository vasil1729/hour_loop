import type {
  AssistantPendingAction,
  AssistantTool,
  AssistantToolContext,
} from './assistantTypes';
import {
  AssistantActionError,
  createPendingAction,
  executeAssistantAction,
  isActionExpired,
} from './assistantActionApproval';

const context = {} as AssistantToolContext;

function makeTool(overrides: Partial<AssistantTool> = {}): AssistantTool {
  return {
    name: 'create_test_record',
    description: 'Create a record.',
    risk: 'write',
    parameters: { type: 'object' },
    parse: (args) => args,
    describe: () => 'Create a record.',
    targetIds: () => ['target-1'],
    execute: jest.fn(async () => ({ summary: 'Created.' })),
    prepare: async () => ({
      description: 'Create “Test”.',
      targetIds: ['target-1'],
    }),
    revalidate: jest.fn(async () => undefined),
    ...overrides,
  };
}

function makeAction(
  tool: AssistantTool,
  now = Date.now()
): AssistantPendingAction {
  return createPendingAction(
    tool,
    { title: 'Test' },
    { description: 'Create “Test”.', targetIds: ['target-1'] },
    now
  );
}

describe('assistant action approval', () => {
  it('does not execute a mutation when the action is only prepared', () => {
    const tool = makeTool();
    makeAction(tool);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('executes exactly once even if confirmation is repeated', async () => {
    const tool = makeTool();
    const action = makeAction(tool);

    const result = await executeAssistantAction(context, tool, action, {
      writesEnabled: true,
    });
    expect(result.summary).toBe('Created.');
    expect(tool.execute).toHaveBeenCalledTimes(1);

    await expect(
      executeAssistantAction(context, tool, action, { writesEnabled: true })
    ).rejects.toMatchObject({ code: 'already_handled' });
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent approvals exactly once', async () => {
    const tool = makeTool();
    const action = makeAction(tool);

    const results = await Promise.allSettled([
      executeAssistantAction(context, tool, action, { writesEnabled: true }),
      executeAssistantAction(context, tool, action, { writesEnabled: true }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
      1
    );
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
      1
    );
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects a cancelled action without executing it', async () => {
    const tool = makeTool();
    const action = { ...makeAction(tool), status: 'cancelled' as const };

    await expect(
      executeAssistantAction(context, tool, action, { writesEnabled: true })
    ).rejects.toBeInstanceOf(AssistantActionError);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('rejects an expired action', async () => {
    const tool = makeTool();
    const created = Date.now() - 10 * 60 * 1000;
    const action = makeAction(tool, created);
    expect(isActionExpired(action)).toBe(true);

    await expect(
      executeAssistantAction(context, tool, action, { writesEnabled: true })
    ).rejects.toMatchObject({ code: 'expired' });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('revalidates a stale target immediately before execution', async () => {
    const tool = makeTool({
      revalidate: jest.fn(async () => {
        throw new Error('Target no longer exists.');
      }),
    });
    const action = makeAction(tool);

    await expect(
      executeAssistantAction(context, tool, action, { writesEnabled: true })
    ).rejects.toThrow('Target no longer exists.');
    expect(tool.execute).not.toHaveBeenCalled();

    // A failed revalidation never allows an automatic retry of the mutation.
    await expect(
      executeAssistantAction(context, tool, action, { writesEnabled: true })
    ).rejects.toMatchObject({ code: 'already_handled' });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('blocks execution when writes are disabled after preparation', async () => {
    const tool = makeTool();
    const action = makeAction(tool);

    await expect(
      executeAssistantAction(context, tool, action, { writesEnabled: false })
    ).rejects.toMatchObject({ code: 'writes_disabled' });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('always executes the stored arguments, not caller-supplied values', async () => {
    const execute = jest.fn(async () => ({ summary: 'Created.' }));
    const tool = makeTool({ execute });
    const action = makeAction(tool);
    const originalArgs = action.args;

    await executeAssistantAction(context, tool, action, {
      writesEnabled: true,
    });

    expect(execute).toHaveBeenCalledWith(context, originalArgs);
  });
});
