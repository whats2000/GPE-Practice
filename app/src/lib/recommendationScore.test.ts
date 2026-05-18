import { describe, it, expect } from 'vitest'
import { computeBuildTimeScore, addNotPassedBonus } from './recommendationScore'

describe('computeBuildTimeScore', () => {
  const ctx = { maxAppearanceCount: 10, currentYear: 2026 }

  it('returns 0 for a never-appeared, ancient, always-AC question', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 0, lastAppearedYear: 2010, acRate: 1.0 },
      ctx,
    )
    expect(score).toBe(0)
  })

  it('returns 90 (max build score) for a maximally frequent, recent, hardest question', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 10, lastAppearedYear: 2026, acRate: 0.0 },
      ctx,
    )
    expect(score).toBe(90)
  })

  it('weights frequency more than recency more than difficulty', () => {
    const freqOnly = computeBuildTimeScore(
      { appearanceCount: 10, lastAppearedYear: 2016, acRate: 1 },
      ctx,
    )
    const recencyOnly = computeBuildTimeScore(
      { appearanceCount: 0, lastAppearedYear: 2026, acRate: 1 },
      ctx,
    )
    const difficultyOnly = computeBuildTimeScore(
      { appearanceCount: 0, lastAppearedYear: 2016, acRate: 0 },
      ctx,
    )
    expect(freqOnly).toBeGreaterThan(recencyOnly)
    expect(recencyOnly).toBeGreaterThan(difficultyOnly)
  })

  it('handles empty corpus gracefully (no division by zero)', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 5, lastAppearedYear: 2026, acRate: 0.5 },
      { maxAppearanceCount: 0, currentYear: 2026 },
    )
    expect(score).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(score)).toBe(true)
  })
})

describe('addNotPassedBonus', () => {
  it('adds 10 if not passed', () => {
    expect(addNotPassedBonus(70, false)).toBe(80)
  })

  it('adds 0 if already passed', () => {
    expect(addNotPassedBonus(70, true)).toBe(70)
  })

  it('clamps to 100', () => {
    expect(addNotPassedBonus(95, false)).toBe(100)
  })
})
