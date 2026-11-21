# Tubescope

Tubescope — a read-only YouTube research desk for small channels: keywords, outliers, competitor tracking, analytics. Never edits or publishes anything.

It runs on your own machine. Public channel research uses the YouTube Data API. Owner analytics uses read-only Google OAuth. Suggestions and drafts are for manual use in YouTube Studio. Estimates are labelled as estimates.

## Run with Bun

Requires Bun 1.4.0 or later.

```sh
bun install
bun start
```

Open http://localhost:4949. Use `bun run dev` for watch mode and `bun run test` for the backend tests.

Optional local production helpers need ffmpeg or whisper.cpp. AI is disabled by default; enable the Claude Code CLI or an Anthropic API key in Settings if needed.

## Run with Docker

```sh
docker build -t tubescope:bun .
docker run -d --name tubescope \
  -p 127.0.0.1:4949:4949 \
  -v tubescope-data:/data \
  --read-only --tmpfs /tmp --cap-drop ALL \
  tubescope:bun
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

Data defaults to `data/tubescope.sqlite`. Set `TUBESCOPE_DATA_DIR` to choose another directory or `TUBESCOPE_DB` for an explicit database path. Existing default database files migrate on startup. Existing environment names and backup filenames remain supported. Settings includes database backup and restore.

The server accepts localhost connections by default. Keep the default unless you intend to enable LAN access in Settings.

Run `bun mcp/server.js` from a local MCP client while the app is running. Set `TUBESCOPE_URL` if the server is elsewhere. `GET /api/tools` lists tools, and `GET /api/agent` lists local routes. The generic MCP API tool is `tubescope_api`.

The optional browser extension is in `extension/`. In Chromium, open `chrome://extensions`, enable Developer mode and choose **Load unpacked**. It connects to `http://localhost:4949` by default; its options let you change the address.

## Credits

Tubescope started as a fork of [TubeDesk](https://github.com/WealthRxAi/tubedesk) by LLCreativity LLC (MIT licence). Thanks to its author.

Feature ideas are inspired by vidIQ. Tubescope is not affiliated with vidIQ, YouTube or Google.

## Licence

MIT. See [LICENSE](LICENSE) for both copyright notices and the licence terms.
