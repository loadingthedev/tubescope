# Tubescope

Tubescope — a read-only YouTube research desk for small channels: keywords, outliers, competitor tracking, analytics. Never edits or publishes anything.

It runs on your own machine. Public channel research uses the YouTube Data API. Owner analytics uses read-only Google OAuth. Suggestions and drafts are for manual use in YouTube Studio. Estimates are labelled as estimates.

## Workspace layout

- `apps/api/`: Bun + Express API, MCP server, backend tests, and unchanged classic UI in `public/`.
- `apps/web/`: React 19 + Vite + React Router + React Query + Tailwind CSS v4.
- `packages/shared/`: API response types only; no runtime build.
- `tsconfig.base.json`: shared compiler options. The new web and shared workspaces use strict checking; the existing API keeps its loose first-pass types.

## Commands

Development checks require **Bun 1.4.6-canary** until 1.4.6 stable ships. The runtime and Docker use Bun 1.4.5; `packageManager` stays `bun@1.4.5`.

```sh
bun install
bun run dev
```

`bun run dev` starts the API watcher on http://localhost:4949 and Vite on http://localhost:5173/app/. Vite proxies `/api` and `/data` to the API. The classic UI stays at the API root.

```sh
bun run build      # build apps/web/dist (API needs no build)
bun start          # run API; React preview is at http://localhost:4949/app/
bun run test       # backend tests across workspaces
bun run typecheck  # bun check in every workspace
bun run snapshot   # run the API snapshot job
bun run format     # format owned source files
bun run format:check
bun run lint       # recommended + type-aware rules; warnings are informational
bun run lint:fix   # safe automatic fixes only
bun run check      # format check, lint, types, tests; stop at the first error
```

The React preview currently implements Keywords: autocomplete, demand index (not search volume), long-tail ideas, and optional competition evidence. Dashboard, Outliers, and Competitors link back to the classic UI until they reach parity. Competition uses the existing search API and quota; it runs only when requested.

Build once before using `/app` through the API. Docker builds the preview automatically. Run a single workspace with `bun run --filter @tubescope/api dev` or `bun run --filter @tubescope/web dev`.

Optional local production helpers need ffmpeg or whisper.cpp. AI is disabled by default; enable the Claude Code CLI or an Anthropic API key in Settings if needed.

### Pre-commit hook

`bun install` runs the root `prepare` script, which installs `scripts/pre-commit` as a symlink at `.git/hooks/pre-commit`. Run `bun run prepare` to reinstall it after moving the checkout. Git worktrees use the hooks directory reported by `git rev-parse --git-path hooks`.

The hook runs `bun lint --no-script --staged --fix`, then `bun fmt --no-script --staged`. Bun preserves partial staging by refusing to rewrite a file with both staged and unstaged edits. The full `bun run check` runs the complete checks.

The formatter uses single quotes, semicolons, and a 160-column width. Both tools exclude `apps/api/public/`, `extension/`, and generated output. TypeScript remains installed for editor support; the scripts use Bun's built-in checker.

## Run with Docker

```sh
docker build -t tubescope:mono .
# One-time setup for a new volume: allow Docker's forwarded connections.
# The API keeps its existing local-only default; the host port stays bound to loopback.
docker run --rm -v tubescope-data:/data tubescope:mono \
  bun -e "import { setSetting } from './apps/api/src/db.ts'; setSetting('allow_lan', '1');"
docker run -d --name tubescope \
  -p 127.0.0.1:4949:4949 \
  -v tubescope-data:/data \
  --read-only --tmpfs /tmp --cap-drop ALL \
  tubescope:mono
```

The volume keeps the database and local files across container replacements. For an existing installation, reuse its existing data volume.

## Configure YouTube access

1. Create a Google Cloud project and enable **YouTube Data API v3** and **YouTube Analytics API**.
2. Create an API key under **APIs & Services → Credentials**. Paste it into Tubescope Settings. Public channel and competitor research uses this key.
3. For owner analytics, create an OAuth client ID of type **Web application**. Set the redirect URI to `http://localhost:4949/oauth/callback`. Configure the consent screen and add your account as a test user if the app is in Testing.
4. Paste the OAuth client ID and secret into Settings. Use **Connect with Google** under Channels. Requested scopes are `youtube.readonly`, `yt-analytics.readonly` and `yt-analytics-monetary.readonly`.
5. Add competitor channels under Competitors.

Google test-mode consent can expire after seven days. Reconnect when needed. Tokens are stored locally. Tubescope does not request upload or account-editing scopes.

For impressions and CTR, enable **YouTube Reporting API** and use an existing `channel_reach_basic_a1` report job. This fork cannot create report jobs. You can also import a CSV from YouTube Studio under Analytics → Impressions & CTR.

## Local data and tools

Data defaults to `apps/api/data/tubescope.sqlite`. The move does not relocate an existing root `data/` directory; set `TUBESCOPE_DATA_DIR` to its absolute path to reuse it. In Docker, data lives at `/data`. Set `TUBESCOPE_DATA_DIR` to choose another directory or `TUBESCOPE_DB` for an explicit database path. Existing default database files migrate on startup. Existing environment names and backup filenames remain supported. Settings includes database backup and restore.

The server accepts localhost connections by default. Keep that default for local development. Docker needs `allow_lan=1` inside the container; keep its published host port bound to `127.0.0.1`.

Run `bun apps/api/mcp/server.ts` from a local MCP client while the app is running. Set `TUBESCOPE_URL` if the server is elsewhere. `GET /api/tools` lists tools, and `GET /api/agent` lists local routes. The generic MCP API tool is `tubescope_api`.

The optional browser extension is in `extension/`. In Chromium, open `chrome://extensions`, enable Developer mode and choose **Load unpacked**. It connects to `http://localhost:4949` by default; its options let you change the address.

## Credits

Tubescope started as a fork of [TubeDesk](https://github.com/WealthRxAi/tubedesk) by LLCreativity LLC (MIT licence). Thanks to its author.

Feature ideas are inspired by vidIQ. Tubescope is not affiliated with vidIQ, YouTube or Google.

## Licence

MIT. See [LICENSE](LICENSE) for both copyright notices and the licence terms.

## Weekly reports in Notion

Create a Notion internal integration, then share **Tubescope weekly reports** with it. Paste its token into `notion_token` in Settings (or set `TUBESCOPE_NOTION_TOKEN`). `notion_reports_page_id` defaults to `41fb9c2f64fc80d9ae97f2b000b7151d`. The report runs Monday at 08:30 in your configured `timezone`; use `notion_report_cron` or `notion_report_enabled` to change this (restart after schedule changes). Preview with `GET /api/reports/weekly` or the MCP `weekly_report` tool. Publish with `POST /api/reports/weekly/notion`; `{ "dryRun": true }` previews without contacting Notion. Reports use local data only and reuse an existing child page with the same week title.
