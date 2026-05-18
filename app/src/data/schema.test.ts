import { describe, it, expect } from 'vitest'
import { QuestionMetaSchema } from './schema'

const validMeta = {
  id: 'b056-two-sum',
  title: 'Two Sum',
  gpeYear: 2023,
  gpeSession: 2,
  gpeNo: 'B056',
  uvaId: 12345,
  uvaName: 'UVA - Sum it Up',
  tags: ['array', 'hashing'],
  difficulty: 'easy' as const,
  timeLimitMs: 2000,
  memLimitMb: 256,
  judge: { mode: 'whitespace' as const },
  generatedSeeds: [{ seed: 1, label: 'small' }],
  stats: {
    appearanceCount: 5,
    lastAppearedYear: 2023,
    acRate: 0.62,
    recommendationScore: 78,
  },
}

describe('QuestionMetaSchema', () => {
  it('accepts a fully-valid meta object', () => {
    expect(() => QuestionMetaSchema.parse(validMeta)).not.toThrow()
  })

  it('rejects non-kebab-case ids', () => {
    expect(() =>
      QuestionMetaSchema.parse({ ...validMeta, id: 'NotKebabCase' }),
    ).toThrow(/kebab-case/)
  })

  it('rejects ac rate above 1', () => {
    expect(() =>
      QuestionMetaSchema.parse({
        ...validMeta,
        stats: { ...validMeta.stats, acRate: 1.2 },
      }),
    ).toThrow()
  })

  it('rejects float judge mode without eps', () => {
    expect(() =>
      QuestionMetaSchema.parse({
        ...validMeta,
        judge: { mode: 'float' },
      } as unknown),
    ).toThrow()
  })

  it('accepts null uvaId + uvaName for non-mirrored questions', () => {
    const parsed = QuestionMetaSchema.parse({
      ...validMeta,
      uvaId: null,
      uvaName: null,
    })
    expect(parsed.uvaId).toBeNull()
    expect(parsed.uvaName).toBeNull()
  })
})
