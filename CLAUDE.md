# CLAUDE.md — Backgammon Teacher

## What is this project?

A full-stack backgammon teaching app. Users play against a computer opponent powered by GNU Backgammon (via WASM), get blunder detection, and receive LLM-generated natural language explanations of mistakes.

Live at: `backgammon-teacher.a5r0n.workers.dev`

## Tech stack

| Layer | Tech |
|-------|------|
| Framework | SvelteKit 2 (Svelte 5 with runes) |
| Language | TypeScript (strict mode) |
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| File storage | Cloudflare R2 |
| Cache | Cloudflare KV |
| AI/LLM | Cloudflare Workers AI (default), Anthropic, or OpenAI |
| Auth | Google OAuth 2.0 |
| Build | Vite 7 |
| Unit tests | Vitest |
| E2E tests | Playwright (Chromium) |
| CI | GitHub Actions |

## Quick reference

```bash
npm run dev              # Start dev server (uses wrangler + vite)
npm run build            # Production build
npm run check            # Svelte-check + type checking
npm run test             # Unit tests (vitest)
npm run test:e2e         # E2E tests (playwright)
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Apply migrations to D1
npx tsc --noEmit         # TypeScript check only
```

## Project structure

```
src/
├── app.d.ts                  # Global types (Platform.env bindings)
├── hooks.server.ts           # Server error handling
├── lib/
│   ├── backgammon/           # Core domain: board, rules, move generation, types
│   ├── analysis/             # GNU Backgammon integration (WASM + CLI)
│   ├── features/             # Position feature extraction & comparison
│   ├── game/                 # Game state, computer player, blunder detection
│   ├── llm/                  # LLM explainer and prompt templates
│   ├── auth/                 # Google OAuth + auth store
│   ├── storage/              # R2 game file persistence
│   ├── db/                   # Drizzle schema and client
│   ├── data/                 # Sample positions
│   └── components/           # Svelte components (Board, Dice, AnalysisPanel)
├── routes/
│   ├── +page.svelte          # Home page
│   ├── play/+page.svelte     # Play vs computer
│   ├── review/+page.svelte   # Position review
│   ├── my-games/+page.svelte # Saved games (auth required)
│   ├── settings/+page.svelte # User preferences
│   └── api/                  # Server endpoints (explain, games)
└── tests/                    # Unit tests (vitest)
e2e/                          # Playwright E2E tests
drizzle/                      # Database migrations
static/wasm/                  # Pre-built GnuBG WASM files
```

## Cloudflare bindings (wrangler.jsonc)

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 Database | Game sessions, moves, user preferences |
| `GAME_FILES` | R2 Bucket | Game file storage |
| `AUTH_CACHE` | KV Namespace | OAuth token caching |
| `AI` | Workers AI | LLM for move explanations |
| `ASSETS` | Static Assets | SvelteKit build output |

All bindings are typed in `src/app.d.ts` under `App.Platform.env`.

## Environment variables

Set via `wrangler secret put` or in `.dev.vars` locally:

- `LLM_PROVIDER` — `workers-ai` (default), `anthropic`, `openai`, or `mock`
- `LLM_API_KEY` — Required when using anthropic/openai
- `PUBLIC_GOOGLE_CLIENT_ID` — Google OAuth client ID
- `AI_GATEWAY_ACCOUNT_ID` / `AI_GATEWAY_NAME` — Optional CF AI Gateway routing

## Key conventions

### Svelte 5 runes
This project uses Svelte 5. Use `$state()` for reactive state and `$props()` for component props. Do NOT use the legacy `let` reactivity or `export let` props syntax.

### Board representation
- 24 points as signed integers: positive = player's checkers, negative = opponent's
- Constants: `BAR = 25`, `OFF = 0`, `CHECKERS_PER_PLAYER = 15`
- Player moves from point 24 toward point 1 (bearing off at 0)

### Database
- Drizzle ORM with SQLite dialect (D1)
- Schema in `src/lib/db/schema.ts`
- Column names use snake_case
- Generate migrations with `npm run db:generate`, apply with `npm run db:migrate`

### File naming
- PascalCase for `.svelte` components
- camelCase for `.ts` files
- SvelteKit route conventions: `+page.svelte`, `+server.ts`, `+layout.svelte`

### Types
- Core domain types live in `src/lib/backgammon/types.ts`
- Key types: `BoardState`, `Move`, `GameState`, `Player`, `DieValue`, `Difficulty`, `BlunderLevel`, `CandidateMoveAnalysis`, `PositionAnalysis`

### Testing
- Unit tests go in `src/tests/` (not colocated with source)
- E2E tests go in `e2e/`
- Run `npm run test` before committing
- Playwright uses Chromium only, with `--no-sandbox` for CI

## CI pipeline

GitHub Actions runs 4 parallel jobs on push to `main` and on PRs:
1. **Lint & Typecheck** — `tsc --noEmit` + `svelte-check`
2. **Unit Tests** — `vitest run`
3. **Build** — `vite build`
4. **E2E Tests** — Playwright with artifact upload (14-day retention)

All jobs use Node 22.

## Deployment

```bash
npm run build            # Build SvelteKit for Cloudflare
npx wrangler deploy      # Deploy to Cloudflare Workers
```

The adapter is `@sveltejs/adapter-cloudflare`. Build output goes to `.svelte-kit/cloudflare/`.

## Architecture notes

- **GnuBG WASM** — The analysis engine runs client-side via WASM (`static/wasm/`). Server-side falls back to a local GnuBG CLI if available.
- **Blunder detection** — Compares player's move equity against the best move. Thresholds classify into: none, inaccuracy, mistake, blunder, hugeBlunder.
- **LLM explanations** — When a blunder is detected, position features are extracted and sent to an LLM for a natural language explanation of why the best move is better.
- **Auth flow** — Google Sign-In on client, credential verified server-side, cached in KV.
