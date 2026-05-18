import { z } from 'zod'

export const JudgeModeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('exact') }),
  z.object({ mode: z.literal('whitespace') }),
  z.object({ mode: z.literal('float'), eps: z.number().positive() }),
])

export const DifficultySchema = z.enum(['easy', 'medium', 'hard'])

export const GeneratedSeedSchema = z.object({
  seed: z.number().int().nonnegative(),
  label: z.string().min(1),
})

export const StatsSchema = z.object({
  appearanceCount: z.number().int().nonnegative(),
  lastAppearedYear: z.number().int().min(2000).max(2100),
  acRate: z.number().min(0).max(1),
  recommendationScore: z.number().min(0).max(100),
})

export const QuestionMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case'),
  title: z.string().min(1),
  gpeYear: z.number().int().min(2000).max(2100),
  gpeSession: z.number().int().min(1).max(12),
  gpeNo: z.string().min(1),
  uvaId: z.number().int().positive().nullable(),
  uvaName: z.string().min(1).nullable(),
  tags: z.array(z.string().min(1)),
  difficulty: DifficultySchema,
  timeLimitMs: z.number().int().positive(),
  memLimitMb: z.number().int().positive(),
  judge: JudgeModeSchema,
  generatedSeeds: z.array(GeneratedSeedSchema),
  stats: StatsSchema,
})

export type QuestionMeta = z.infer<typeof QuestionMetaSchema>
export type JudgeMode = z.infer<typeof JudgeModeSchema>
export type Difficulty = z.infer<typeof DifficultySchema>
