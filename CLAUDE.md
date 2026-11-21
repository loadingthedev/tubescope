# Tubescope (Oddstory fork)

Private MIT fork, taken at upstream commit 3503111. See README.md for upstream credits. It is our YouTube research desk: keywords, outliers, competitors, analytics. It replaces vidIQ.

## Rules

- Read-only. This app never uploads, edits, schedules or deletes videos, never changes titles, tags, thumbnails or privacy, never replies to comments and never posts to any platform. The owner posts by hand. Don't add write features back.
- Don't pull or merge from `upstream`. Upstream is a single, new author: copy an idea by hand only after reading the code.
- New features take inspiration from vidIQ (what it shows and how), built on free sources: YouTube Data API, YouTube Analytics API (read-only scopes), autocomplete, Google Trends.
- Estimates must be labelled as estimates. Never present a made-up number as data (no fake search volume).
- Quota: searches have their own 100/day limit; everything else shares 10,000 units/day.

## Layout and run

- Bun 1.4 (runtime, package manager, workspaces, tests). API database: `bun:sqlite`.
- `apps/api/`: `src/`, `mcp/`, `test/`, and unchanged legacy `public/`. API package: `@tubescope/api`.
- `apps/web/`: React 19, Vite, React Router, React Query, Tailwind CSS v4. Package: `@tubescope/web`.
- `packages/shared/`: `@tubescope/shared` response types, imported with `import type` by both apps. No runtime code or build.
- Root `bun install`; `bun run dev` runs API watch mode (:4949) and Vite (:5173/app/). Vite proxies `/api` and `/data` to :4949.
- `bun run build` builds web assets. `bun start` runs the API with classic UI at `/` and React preview at `/app` (SPA fallback). Build web first. Leave legacy UI files unchanged until React reaches parity.
- `bun run test` runs workspace tests. `bun run typecheck` checks all workspaces. Keep API's loose first-pass typing; web/shared use strict checking.
- Local data defaults to `apps/api/data`; use an absolute `TUBESCOPE_DATA_DIR` to reuse existing data. Docker uses `/data`.
- Docker: `docker build -t tubescope:mono .`. See README for one-time volume setup (`allow_lan=1` permits forwarded Docker connections without changing guards), then run with volume `tubescope-data:/data`, `-p 127.0.0.1:4949:4949`, `--read-only --tmpfs /tmp --cap-drop ALL`.
- MCP: `bun apps/api/mcp/server.ts` while the API runs.
