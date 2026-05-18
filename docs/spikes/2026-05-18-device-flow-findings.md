# Device Flow Spike — Findings (pivoted to PAT)

**Date:** 2026-05-18
**Spike target:** spec §11.2 (Device Flow CORS risk) — RESOLVED-BY-PIVOT
**Conclusion:** Spike obsolete — we pivoted to user-supplied PAT.

## Decision

We initially planned to test Device Flow CORS from a browser. Before running the test, the user pointed at the sibling project `robotic-skill-visualize` (`d:\GitHub\robotic-skill-visualize`) which ships a working PR-creation flow on GitHub Pages today, using a user-supplied Personal Access Token (PAT) instead of Device Flow.

PAT is:
- Simpler UX: one password field, no OAuth dance, no Client ID registration per user
- Proven on the static-only target (sibling project is deployed and working)
- Compatible with our local-first / no-cross-device-sync stance — token is paste-per-session by default
- Aligned with octokit's standard auth path (no special endpoints)

We adopted PAT and made spec §9 reflect the new auth model. See spec §9 for the full UX flow.

## Verification harness

`spike/device-flow/` was repurposed into a small PAT verification page:
- User pastes their fine-grained PAT
- The page calls `GET /user`, `GET /repos/{owner}/{repo}`, optionally `POST /forks`
- Reports PASS/FAIL with HTTP status per call

This is a sanity-check tool, not an architectural spike. PAT working with octokit from a static page is universally established.

## Static-only invariant

Preserved. PAT never leaves the browser except as `Authorization: Bearer …` on octokit's outbound calls to api.github.com.

## Cross-references

- Spec: `docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md` §9 (auth model)
- Reference UX: `D:\GitHub\robotic-skill-visualize\src\components\PRGenerator\PRPreviewModal.tsx`
- Spike harness: `spike/device-flow/`
