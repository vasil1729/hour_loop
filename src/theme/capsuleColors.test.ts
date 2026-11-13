import { capsuleColor } from './capsuleColors';

describe('capsuleColor', () => {
  it('is deterministic for the same index', () => {
    expect(capsuleColor(3)).toBe(capsuleColor(3));
  });

  it('spreads many capsules without repeating a color', () => {
    const colors = Array.from({ length: 24 }, (_, index) =>
      capsuleColor(index)
    );
    expect(new Set(colors).size).toBe(colors.length);
  });
});
