export type WaddOption = { id: string; weight: number };
export type WaddFactor = { id: string; weight: number };
export type WaddScores = Record<string, Record<string, number>>;

export function computeWaddScores(
  options: WaddOption[],
  factors: WaddFactor[],
  scores: WaddScores
): Record<string, number> {
  const result: Record<string, number> = {};
  options.forEach(option => {
    let weightedTotal = 0;
    let weightSum = 0;
    const optionWeight = Math.max(0, option.weight);
    factors.forEach(factor => {
      const factorWeight = Math.max(0, factor.weight);
      if (!factorWeight || !optionWeight) return;
      const rawScore = scores[factor.id]?.[option.id] ?? 0;
      const clamped = Math.max(-1, Math.min(1, rawScore));
      const normalizedUtility = (clamped + 1) / 2;
      const combinedWeight = factorWeight * optionWeight;
      weightedTotal += combinedWeight * normalizedUtility;
      weightSum += combinedWeight;
    });
    const normalized = weightSum ? weightedTotal / weightSum : 0;
    result[option.id] = Number((normalized * 10).toFixed(2));
  });
  return result;
}

export function buildRankLookup(scores: Record<string, number>) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const lookup = new Map<string, { rank: number; total: number }>();
  const total = entries.length;
  entries.forEach(([id], idx) => {
    lookup.set(id, { rank: idx + 1, total });
  });
  return lookup;
}
