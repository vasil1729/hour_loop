/**
 * Capsule colors are generated with a golden-angle hue step. This spreads any
 * number of capsules around the color wheel instead of repeating a short
 * palette, while staying deterministic for the same item order.
 */
const GOLDEN_ANGLE = 137.508;
const BASE_HUE = 250;

export function capsuleColor(index: number): string {
  const hue = (BASE_HUE + index * GOLDEN_ANGLE) % 360;
  return `hsl(${Math.round(hue)}, 68%, 50%)`;
}
