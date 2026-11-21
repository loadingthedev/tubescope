# Tubescope (Oddstory fork)

Private MIT fork, taken at upstream commit 3503111. See README.md for upstream credits. It is our YouTube research desk: keywords, outliers, competitors, analytics. It replaces vidIQ.

## Rules

- Read-only. This app never uploads, edits, schedules or deletes videos, never changes titles, tags, thumbnails or privacy, never replies to comments and never posts to any platform. The owner posts by hand. Don't add write features back.
- Don't pull or merge from `upstream`. Upstream is a single, new author: copy an idea by hand only after reading the code.
- New features take inspiration from vidIQ (what it shows and how), built on free sources: YouTube Data API, YouTube Analytics API (read-only scopes), autocomplete, Google Trends.
- Estimates must be labelled as estimates. Never present a made-up number as data (no fake search volume).
- Quota: searches have their own 100/day limit; everything else shares 10,000 units/day.

## Run

- Bun 1.4 (runtime, package manager, tests). Database: `bun:sqlite`.
- Docker on the Mac: `docker build -t tubescope:bun .` then run container `tubescope` with volume `tubescope-data:/data`, `-p 127.0.0.1:4949:4949`, `--read-only --tmpfs /tmp --cap-drop ALL`. http://localhost:4949
- Tests: `bun run test`
