import {
  DEFAULT_EDGE_MODEL_ID,
  EDGE_MODELS,
  EDGE_MODEL_TIERS,
  formatEdgeModelSize,
  getEdgeModel,
  isEdgeModelId,
} from './edgeModels';

describe('curated on-device models', () => {
  it('ships exactly four models, two per RAM tier', () => {
    expect(EDGE_MODELS).toHaveLength(4);
    expect(EDGE_MODEL_TIERS['4gb'].models).toHaveLength(2);
    expect(EDGE_MODEL_TIERS['6gb'].models).toHaveLength(2);
    expect(DEFAULT_EDGE_MODEL_ID).toBe('qwen3.5-0.8b');
  });

  it('uses unique ids and pinned immutable revisions', () => {
    const ids = EDGE_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of EDGE_MODELS) {
      expect(model.downloadUrl).toContain(`/resolve/${model.revision}/`);
      expect(model.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(model.downloadSizeBytes).toBeGreaterThan(0);
      expect(model.contextLimit).toBeGreaterThan(0);
      expect(model.maxOutputTokens).toBeGreaterThan(0);
      expect(model.maxOutputTokens).toBeLessThan(model.contextLimit);
    }
  });

  it('keeps the verified GGUF sizes', () => {
    expect(
      Object.fromEntries(
        EDGE_MODELS.map((model) => [model.id, model.downloadSizeBytes])
      )
    ).toEqual({
      'qwen3.5-0.8b': 532_517_120,
      'lfm2.5-1.2b': 730_895_168,
      'qwen3.5-2b': 1_280_835_840,
      'gemma-4-e2b': 3_106_738_272,
    });
  });

  it('resolves known ids and rejects unknown ones', () => {
    expect(getEdgeModel('qwen3.5-2b').displayName).toBe('Qwen3.5 2B');
    expect(isEdgeModelId('gemma-4-e2b')).toBe(true);
    expect(isEdgeModelId('gpt-4o')).toBe(false);
    expect(() => getEdgeModel('gpt-4o')).toThrow('Unknown on-device model');
  });

  it('formats decimal download sizes for the settings UI', () => {
    expect(formatEdgeModelSize(532_517_120)).toBe('533 MB');
    expect(formatEdgeModelSize(3_106_738_272)).toBe('3.11 GB');
    expect(formatEdgeModelSize(500)).toBe('1 KB');
  });
});
