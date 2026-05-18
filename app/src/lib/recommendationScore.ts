export interface StatsInput {
  appearanceCount: number
  lastAppearedYear: number
  acRate: number
}

export interface CorpusContext {
  maxAppearanceCount: number  // pre-computed across all questions
  currentYear: number
}

/**
 * Build-time portion of the recommendation score.
 * Returns 0..90 (the 10% not-passed bonus is applied client-side, see addNotPassedBonus).
 *
 * Formula:
 *   buildScore = 90 * (
 *     (4/9) * normalize(appearanceCount, [0, maxAppearanceCount]) +
 *     (3/9) * normalize(currentYear - lastAppearedYear, [0, 10], inverted=true) +
 *     (2/9) * normalize(1 - acRate, [0, 1])
 *   )
 *
 * Weights (4:3:2) are normalised to sum to 1 so that max inputs yield exactly 90.
 *
 * The 0.90 multiplier (not 1.0) leaves headroom for the client-side bonus.
 */
export function computeBuildTimeScore(stats: StatsInput, ctx: CorpusContext): number {
  const freqWeight = 4 / 9
  const recencyWeight = 3 / 9
  const difficultyWeight = 2 / 9

  const freqNorm =
    ctx.maxAppearanceCount > 0 ? stats.appearanceCount / ctx.maxAppearanceCount : 0
  const yearGap = Math.max(0, Math.min(10, ctx.currentYear - stats.lastAppearedYear))
  const recencyNorm = 1 - yearGap / 10
  const difficultyNorm = clamp01(1 - stats.acRate)

  const raw =
    90 * (freqWeight * freqNorm + recencyWeight * recencyNorm + difficultyWeight * difficultyNorm)

  return roundTo(clamp(raw, 0, 90), 1)
}

/**
 * Client-side: add the not-passed bonus if the user hasn't already passed this question.
 * Returns 0..100.
 */
export function addNotPassedBonus(buildScore: number, hasPassed: boolean): number {
  const bonus = hasPassed ? 0 : 10
  return roundTo(clamp(buildScore + bonus, 0, 100), 1)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function clamp01(n: number): number {
  return clamp(n, 0, 1)
}

function roundTo(n: number, decimals: number): number {
  const m = 10 ** decimals
  return Math.round(n * m) / m
}
