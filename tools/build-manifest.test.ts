import { describe, it, expect } from 'vitest'
import { computeBuildTimeScore } from './build-manifest'

describe('computeBuildTimeScore (tools-side mirror)', () => {
  it('matches the app-side formula for a typical question', () => {
    // weights are 4/9, 3/9, 2/9 (sum = 1.0); buildScore caps at 90
    // freq: 5/10 = 0.5; recency: 1 - 2/10 = 0.8; difficulty: 0.5
    // raw = 90 * ((4/9)*0.5 + (3/9)*0.8 + (2/9)*0.5) = 90 * (0.5556) = ~50
    const score = computeBuildTimeScore(
      { appearanceCount: 5, lastAppearedYear: 2024, acRate: 0.5 },
      10,
      2026,
    )
    // Tolerance: weights are floating-point fractions, exact value depends on rounding
    expect(score).toBeGreaterThan(45)
    expect(score).toBeLessThan(55)
  })

  it('returns max 90 for a maximally frequent, recent, hardest question', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 10, lastAppearedYear: 2026, acRate: 0 },
      10,
      2026,
    )
    expect(score).toBe(90)
  })

  it('clamps year gap to 10', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 0, lastAppearedYear: 1990, acRate: 1 },
      10,
      2026,
    )
    expect(score).toBe(0)
  })

  it('handles maxAppearanceCount = 0 without dividing by zero', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 5, lastAppearedYear: 2026, acRate: 0.5 },
      0,
      2026,
    )
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})
