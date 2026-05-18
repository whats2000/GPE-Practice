# Recommendation Score (推薦度)

The Question List defaults to sorting by 推薦度 (recommendation score), a 0–100 metric that prioritises questions a student should practice next.

## Formula

```
buildScore = 90 * (
    (4/9) * freq_norm       // appearanceCount / maxAppearanceCount in the corpus
  + (3/9) * recency_norm    // 1 - clamp(currentYear - lastAppearedYear, 0, 10) / 10
  + (2/9) * difficulty_norm // 1 - acRate  (lower AC = harder = more worth practising)
)

finalScore = buildScore + (hasPassed ? 0 : 10)   // client-side bonus
```

The weights (4:3:2) are normalised to sum to 1 so that maximum inputs yield exactly 90.

`buildScore` is computed at build time (in `tools/build-manifest.ts`) and shipped in `meta.json.stats.recommendationScore`. The `+10` not-passed bonus is applied in the browser from `localStorage`, so the same static build serves every user fairly.

## Why these weights

- **Frequency dominates (4/9 ≈ 44%)** — GPE recycles questions across exams. If something appeared 5 times in 5 years, it's overwhelmingly likely to appear again.
- **Recency (3/9 ≈ 33%)** — A question from 2025 is more topical than one from 2018, even at equal frequency.
- **Difficulty (2/9 ≈ 22%)** — Lower AC rate signals a question students struggle with. Practising those gives more value than retreading easy ones.
- **Not-passed bonus (10%)** — Personal: pushes you toward questions you haven't conquered yet without dominating the corpus signal.

## Tuning

This formula is intentionally simple. To revise:

1. Edit `app/src/lib/recommendationScore.ts`.
2. Update `app/src/lib/recommendationScore.test.ts`.
3. Update this document.
4. Re-run `tools/build-manifest.ts` to refresh shipped scores.
5. Open a PR.

There is no "right" formula — this is a heuristic. Open issues if you have a better one.
