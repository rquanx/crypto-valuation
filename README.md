# Crypto Valuation

Next.js app for tracking DeFi protocol income (fees/revenue/holders revenue) from DefiLlama, storing everything in local SQLite, and estimating valuations with user-supplied PE multiples.

## What's inside
- Drag-and-drop dashboard that lets you add tracked protocols, tune PE, and view income series/valuations.
- Ingestion pipeline against DefiLlama with incremental backfill, tracked-protocol pruning, and catalog sync.
- SQLite persistence (`data/crypto-valuation.db` by default) with HTTP-triggered cron jobs for ingest/catalog/prune.
- API surface for coverage search, metrics retrieval, and tracked list management.
- React Query caching, ECharts charts, and React DnD for the interactive UI.

Tech stack: Next.js 16 (App Router) on Node.js runtime, React 19, @tanstack/react-query, better-sqlite3, node-cron, echarts-for-react, tailwind-merge.

## Requirements
- Node.js 20+ (recommended)
- pnpm (or npm/yarn/bun) and SQLite available on the host

## Quick start
```bash
pnpm install

# optional: customize envs in .env.local (see table below)
pnpm dev
# app runs on http://localhost:3000
```

For a clean local database, remove or override `data/crypto-valuation.db` before first run; the schema is created on demand.

## Environment variables
Create `.env.local` (or export in your shell) to override defaults.

| Name | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/crypto-valuation.db` | SQLite file path. |
| `API_CACHE_SECONDS` | `43200` | Cache TTL (seconds) for `/api/coverage` and `/api/metrics/[id]`. |
| `INGEST_SECRET` | _(unset)_ | Shared secret for ingest/scheduler/tracked endpoints (`x-ingest-secret` header or `?token=`). Leave unset to disable auth. |
| `SCHEDULER_BASE_URL` / `SCHEDULER_URL` / `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Base URL the cron scheduler calls. |
| `INGEST_CRON` | `0 2 * * *` | UTC cron for ingest. |
| `CATALOG_CRON` | `30 1 * * *` | UTC cron for catalog sync. |
| `TRACKED_PRUNE_CRON` | `0 1 * * *` | UTC cron for pruning inactive tracked protocols. |
| `INGEST_RUN_ON_BOOT` | `true` | Trigger prune -> catalog -> ingest once on startup. |
| `DISABLE_INGEST_SCHEDULER` | `false` | Skip registering cron jobs when `true`. |
| `INGEST_CONCURRENCY` | `3` | Parallel ingest workers. |
| `INGEST_BACKFILL_DAYS` | `5` | Days to backfill when ingesting. |
| `TRACKED_PROTOCOL_TTL_DAYS` | `30` | Remove tracked protocols not read in this window. |
| `DEFILLAMA_API_BASE` | `https://api.llama.fi` | Data source base URL. |
| `DEFILLAMA_MAX_REQUESTS_PER_MIN` | `90` | Throttle for DefiLlama requests (max 200). |

## Running & data pipeline
- Scheduler is registered in `instrumentation.ts` (runs in the Node.js runtime). It calls `/api/scheduler?job=ingest|catalog|prune` over HTTP; set `INGEST_SECRET` to protect it.
- Manual triggers:
  - `curl -XPOST "http://localhost:3000/api/scheduler?job=ingest" -H "x-ingest-secret: $INGEST_SECRET"`
  - `curl -XPOST "http://localhost:3000/api/ingest?useDirect=true" -H "x-ingest-secret: $INGEST_SECRET"`
- UI adds protocols via `POST /api/tracked` and fetches series from `GET /api/metrics/[slug]`. Coverage search uses `GET /api/coverage`.
- Data lives in `data/crypto-valuation.db` (gitignored). Keep backups if running long-lived ingest.

## Commands
- `pnpm dev` - start dev server on all interfaces.
- `pnpm build` - production build.
- `pnpm start` - run the built app.
- `pnpm lint` - run ESLint.

## Project layout
- `app/` - Next.js routes (API + UI) and page shell.
- `components/valuation/` - dashboard cards, modal, aggregation hooks.
- `lib/` - ingest, DefiLlama client, DB access, scheduler helpers, API utilities.
- `data/` - local SQLite database (created automatically, ignored by git).
- `docs/` - architecture and design notes (`docs/architecture.md`, etc.).

## Notes on data & usage
- Income data comes from DefiLlama (`fees`, `revenue`, `holders_revenue`). Accuracy/availability depends on the upstream API.
- Set `INGEST_SECRET` in any public deployment to prevent unauthorized ingest or scheduler calls.
- This repo ships without tests; add coverage around valuation math, ingest routines, and API contracts before production use.

## License
MIT License. See `LICENSE` for details. Data fetched from third parties (e.g., DefiLlama) may be subject to their terms; validate before redistribution.
