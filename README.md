# GPE-Practice

In-browser C++ practice platform for the Taiwan GPE (General Programming Exam). Rebuilds [GPE-Helper](https://github.com/setsal/GPE-Helper) into a full practice IDE with an in-browser clang+lld toolchain.

**Status:** Phase 1 scaffolding complete. See `docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md` for the full design.

## Quick start (development)

```bash
cd app
pnpm install
pnpm dev
```

Open `http://localhost:5173/`.

## Other commands

```bash
cd app
pnpm test       # vitest run
pnpm build      # type-check + production build (outputs to app/dist/)
pnpm lint       # eslint
pnpm format     # prettier --write
```

## Architecture overview

- **Static-only** deployment on GitHub Pages — no backend at request time.
- **Auth is contribution-only** — practice and browse never prompt for credentials. Users who want to contribute a question or a test case enter a fine-grained GitHub PAT at the moment of submission.
- **WASM C++ toolchain** ([emception](https://github.com/jprendes/emception) pre-built artifacts) runs entirely in the user's browser.
- **All canonical data updates** flow through pull requests (manually or via GitHub Actions).

See the full [design spec](./docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md) for invariants, journeys, schemas, and CI workflow details.

## Layout

```
app/             # the React + TypeScript SPA (Vite)
data/            # canonical question data — meta.json, statement.md, cases/, generators/, solutions/
docs/            # design specs, spike findings, implementation plans
spike/           # Phase 0 spike harnesses (toolchain evaluation + PAT verification)
third_party/     # git submodules (read-only data sources)
tools/           # build-time scripts (run in CI or by maintainers)
```

## License

(TBD — pick before public launch.)
