export const CAPSULE_COLORS = [
  '#7B6EF6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#06B6D4',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#F97316',
  '#64748B',
] as const;

export function capsuleColor(index: number): string {
  return CAPSULE_COLORS[index % CAPSULE_COLORS.length] ?? CAPSULE_COLORS[0];
}
