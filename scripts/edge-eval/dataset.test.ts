/* eslint-disable @typescript-eslint/no-require-imports */
import { classifyScope } from '../../src/features/assistant/scope/scopeClassifier';
import { selectEdgeToolNames } from '../../src/features/assistant/edge/edgeToolRouter';

type DatasetCase = {
  id: string;
  prompt: string;
  expectedScope: string;
  expectedTool: string | null;
  expectedArgs: Record<string, unknown> | null;
  expectedRisk: string | null;
};

const dataset = require('./dataset.json') as {
  version: number;
  cases: DatasetCase[];
};

describe('edge evaluation dataset', () => {
  it('contains at least 50 unique cases', () => {
    expect(dataset.cases.length).toBeGreaterThanOrEqual(50);
    expect(new Set(dataset.cases.map((entry) => entry.id)).size).toBe(
      dataset.cases.length
    );
  });

  it('matches the shipped local scope classifier', () => {
    for (const entry of dataset.cases) {
      expect({
        id: entry.id,
        scope: classifyScope(entry.prompt).category,
      }).toEqual({
        id: entry.id,
        scope: entry.expectedScope,
      });
    }
  });

  it('routes every expected tool into the pruned edge set', () => {
    for (const entry of dataset.cases) {
      if (entry.expectedScope !== 'IN_SCOPE' || !entry.expectedTool) continue;
      const selected = selectEdgeToolNames(entry.prompt);
      expect({ id: entry.id, selected }).toEqual({
        id: entry.id,
        selected: expect.arrayContaining([entry.expectedTool]),
      });
    }
  });

  it('assigns a tool, arguments and risk to every in-scope case', () => {
    for (const entry of dataset.cases) {
      if (entry.expectedScope !== 'IN_SCOPE') continue;
      expect(entry.expectedTool).toBeTruthy();
      expect(entry.expectedArgs).not.toBeNull();
      expect(['read', 'write', 'timer']).toContain(entry.expectedRisk);
    }
  });
});
