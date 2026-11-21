import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { freePort } from './free-port.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubescope-weekly-'));
process.env.TUBESCOPE_DATA_DIR = dataDir;
process.env.TUBESCOPE_NOTION_TOKEN = '';
const token = 'test-notion-secret-never-echo-this';
const now = new Date('2026-11-23T09:00:00Z');
let db, setSetting, buildWeeklyReport, publishWeeklyReport, notion, mock, child, base;
let errorStatus = 0;
const requests = [];
const pages = [];
let output = '';

before(async () => {
  ({ db, setSetting } = await import('../src/db.ts'));
  ({ buildWeeklyReport, publishWeeklyReport } = await import('../src/services/weekly-report.ts'));
  notion = await import('../src/services/notion.ts');
  // Only the schema is needed; report building must not invoke the ideas generator.
  await import('../src/services/ideas.ts');
  setSetting('timezone', 'UTC');
  for (const [id, title, kind] of [
    ['ours', 'Our channel', 'owned'],
    ['comp', 'Competitor', 'competitor'],
    ['other', 'Other tracked', 'competitor'],
    ['empty', 'Second owned', 'owned'],
  ])
    db.prepare('INSERT INTO channels (id, title, kind) VALUES (?, ?, ?)').run(id, title, kind);
  db.prepare('INSERT INTO competitor_links (owned_channel_id, competitor_channel_id) VALUES (?, ?)').run('ours', 'comp');
  const video = (id, channel, title, views, short, date = '2026-11-18T12:00:00Z') =>
    db
      .prepare('INSERT INTO videos (id, channel_id, title, view_count, is_short, published_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, channel, title, views, short, date);
  for (const channel of ['ours', 'comp', 'other']) {
    video(`${channel}-long-a`, channel, 'Long baseline A', 100, 0, '2026-09-01T12:00:00Z');
    video(`${channel}-long-b`, channel, 'Long baseline B', 100, 0, '2026-09-02T12:00:00Z');
    video(`${channel}-short-a`, channel, 'Short baseline A', 1000, 1, '2026-09-01T12:00:00Z');
    video(`${channel}-short-b`, channel, 'Short baseline B', 1000, 1, '2026-09-02T12:00:00Z');
  }
  video('our-long', 'ours', 'Our long upload', 400, 0);
  video('our-short', 'ours', 'Our Short', 2000, 1);
  video('breakout', 'comp', 'Competitor breakout', 600, 0);
  video('not-breakout', 'comp', 'Regular Short', 2000, 1);
  video('copy', 'other', 'Copy this idea', 9000, 1, '2026-11-02T12:00:00Z');
  video('boundary', 'ours', 'Next week upload', 100, 0, '2026-11-23T00:00:00Z');
  video('live', 'ours', 'Live stream', 999999, 0);
  db.prepare('UPDATE videos SET is_live = 1 WHERE id = ?').run('live');
  for (const [day, views, subs] of [
    ['2026-11-08', 1000, 100],
    ['2026-11-15', 1300, 110],
    ['2026-11-22', 1900, 135],
  ])
    db.prepare("INSERT INTO snapshots (entity_type, entity_id, taken_at, day, views, subs) VALUES ('channel', 'ours', ?, ?, ?, ?)").run(
      day + 'T23:00:00Z',
      day,
      views,
      subs
    );
  db.prepare(
    "INSERT INTO snapshots (entity_type, entity_id, taken_at, day, views) VALUES ('video', 'our-long', '2026-11-22T23:00:00Z', '2026-11-22', 350)"
  ).run();
  db.prepare(
    "INSERT INTO alerts (channel_id, kind, title, created_at) VALUES ('ours', 'radar_breakout', 'Watch the long upload', '2026-11-19 10:00:00'), ('ours', 'breakout', 'Not a radar alert', '2026-11-19 10:00:00')"
  ).run();
  db.prepare(
    "INSERT INTO radar_ideas (channel_id, day, rank, best_title, titles_json, predicted_x) VALUES ('ours', '2026-11-20', 1, 'Try a clear before and after', '[]', 3.5)"
  ).run();
  const port = await freePort();
  mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
    });
    req.on('end', () => {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      assert.equal(req.headers['notion-version'], '2022-06-28');
      const url = new URL(req.url, 'http://mock');
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ method: req.method, path: url.pathname, body });
      res.setHeader('content-type', 'application/json');
      if (errorStatus) {
        res.writeHead(errorStatus);
        res.end(JSON.stringify({ message: `upstream echoes ${token}` }));
      } else if (req.method === 'GET') {
        if (!url.searchParams.has('start_cursor')) res.end(JSON.stringify({ results: [{ type: 'paragraph' }], has_more: true, next_cursor: 'next' }));
        else res.end(JSON.stringify({ results: pages.map(p => ({ id: p.id, type: 'child_page', child_page: { title: p.title } })), has_more: false }));
      } else if (req.method === 'POST') {
        assert.ok(body.children.length <= 100);
        const page = {
          id: `page-${pages.length}`,
          title: body.properties.title.title[0].text.content,
          url: `https://www.notion.so/page${pages.length}`,
          children: [...body.children],
        };
        pages.push(page);
        res.end(JSON.stringify({ id: page.id, url: page.url }));
      } else if (req.method === 'PATCH') {
        assert.ok(body.children.length <= 100);
        pages.at(-1).children.push(...body.children);
        res.end(JSON.stringify({ results: [] }));
      } else {
        res.writeHead(400);
        res.end('{}');
      }
    });
  });
  await new Promise<void>(resolve => mock.listen(port, '127.0.0.1', resolve));
  process.env.NOTION_API_BASE = `http://127.0.0.1:${port}/notion`;
});

after(async () => {
  if (child) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  mock?.close();
  db?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('report uses local data, complete calendar weeks, snapshot deltas, and same-format medians', () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM api_log').get().n;
  const report = buildWeeklyReport('ours', { now });
  assert.equal(report.title, 'Tubescope week of 16–22 Nov 2026');
  assert.match(report.markdown, /Views gained: 600 est.; last week: 300 est./);
  assert.match(report.markdown, /Subscribers gained: 25 est.; last week: 10 est./);
  assert.match(report.markdown, /best video by views gained: 350 est./);
  assert.match(report.markdown, /Our long upload.*long · 400 views · 4.0×/);
  assert.match(report.markdown, /Our Short.*Shorts · 2,000 views · 2.0×/);
  assert.match(report.markdown, /Competitor breakout.*Competitor · long · 600 views · 6.0×/);
  assert.equal(report.markdown.split('Competitor breakout]').length, 2, 'breakout appears once');
  assert.ok(!report.markdown.includes('Regular Short'));
  assert.match(report.markdown, /Copy this idea.*9,000 views · 9.0×/);
  assert.match(report.markdown, /1 radar alerts/);
  assert.match(report.markdown, /Try a clear before and after · 3.5× est./);
  assert.ok(!report.markdown.includes('Next week upload'));
  assert.ok(!report.markdown.includes('Live stream'));
  assert.match(buildWeeklyReport('empty', { now }).markdown, /not enough snapshots yet/);
  assert.match(buildWeeklyReport(undefined, { now }).markdown, /Second owned/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM api_log').get().n, before);
  assert.equal(requests.length, 0);
});

test('timezone changes the week at local Monday midnight, including month and year boundaries', () => {
  setSetting('timezone', 'Asia/Kolkata');
  assert.equal(buildWeeklyReport('ours', { now: new Date('2026-11-22T19:00:00Z') }).title, 'Tubescope week of 16–22 Nov 2026');
  assert.equal(buildWeeklyReport('ours', { now: new Date('2026-11-22T18:00:00Z') }).title, 'Tubescope week of 9–15 Nov 2026');
  assert.equal(buildWeeklyReport('ours', { now: new Date('2027-01-04T09:00:00Z') }).title, 'Tubescope week of 28 Dec 2026–3 Jan 2027');
  setSetting('timezone', 'UTC');
});

test('rich text is split below 2000 characters and retains links', () => {
  db.prepare('UPDATE videos SET title = ? WHERE id = ?').run('a'.repeat(1999) + '🦉'.repeat(2000), 'our-long');
  const report = buildWeeklyReport('ours', { now });
  const texts = report.blocks.flatMap(b => b[b.type].rich_text);
  assert.ok(texts.every(t => t.text.content.length <= 2000));
  const linked = texts.filter(t => t.text.link?.url.endsWith('our-long'));
  assert.ok(linked.length >= 3);
  assert.ok(linked.every(t => !/[\uD800-\uDBFF]$/.test(t.text.content)));
  db.prepare('UPDATE videos SET title = ? WHERE id = ?').run('Our long upload', 'our-long');
});

test('unconfigured and dry runs never contact Notion; token supports environment fallback', async () => {
  assert.deepEqual(await publishWeeklyReport(), { skipped: true, reason: 'notion_token is not configured.' });
  process.env.TUBESCOPE_NOTION_TOKEN = token;
  assert.equal((await publishWeeklyReport({ dryRun: true })).dryRun, true);
  setSetting('notion_reports_page_id', '');
  assert.equal((await publishWeeklyReport()).skipped, true);
  setSetting('notion_reports_page_id', notion.DEFAULT_REPORTS_PAGE_ID);
  setSetting('notion_token', token);
  process.env.TUBESCOPE_NOTION_TOKEN = '';
  assert.equal(requests.length, 0);
});

test('publish chunks over 100 blocks and concurrent/second publishes find the existing paginated child', async () => {
  for (let i = 0; i < 20; i++) db.prepare("INSERT INTO channels (id, title, kind) VALUES (?, ?, 'owned')").run(`extra-${i}`, `Extra channel ${i}`);
  const report = buildWeeklyReport();
  assert.ok(report.blocks.length > 200);
  const [first, concurrent] = await Promise.all([publishWeeklyReport(), publishWeeklyReport()]);
  assert.equal(first.created, true);
  assert.deepEqual(concurrent, first);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].children.length, report.blocks.length);
  assert.ok(requests.filter(r => r.method === 'PATCH').length >= 2);
  assert.ok(requests.filter(r => r.body?.children).every(r => r.body.children.length <= 100));
  assert.equal((await publishWeeklyReport()).exists, true);
  assert.equal(pages.length, 1);
  assert.ok(!JSON.stringify(first).includes(token));
});

test('Notion errors explain bad tokens and sharing without exposing upstream text', async () => {
  for (const [status, message] of [
    [404, /Share the page/],
    [401, /rejected the token/],
    [400, /HTTP 400/],
  ] as const) {
    errorStatus = status;
    await assert.rejects(publishWeeklyReport(), err => {
      assert.ok(err instanceof Error);
      assert.match(err.message, message);
      assert.ok(!err.message.includes(token));
      return true;
    });
  }
  errorStatus = 0;
});

test('API previews, publishes, masks secrets, and keeps the mutating-route guards', async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['src/server.ts'], {
    cwd: path.join(import.meta.dir, '..'),
    env: { ...process.env, PORT: String(port), TUBESCOPE_PUBLIC_PORT: String(await freePort()), TUBESCOPE_NO_SCHEDULER: '1', TUBESCOPE_NO_AUTOCONNECT: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => {
    output += data;
  });
  child.stderr.on('data', data => {
    output += data;
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/settings')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* starting */
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, 'test API started');
  const settings = await (await fetch(base + '/api/settings')).json();
  assert.ok(settings.notion_token.startsWith('••••'));
  assert.ok(!JSON.stringify(settings).includes(token));
  const config = await (await fetch(base + '/api/config?group=notion')).text();
  assert.ok(!config.includes(token));
  const preview = await (await fetch(base + '/api/reports/weekly')).json();
  assert.deepEqual(Object.keys(preview).sort(), ['markdown', 'title']);
  const post = (body, headers = {}) =>
    fetch(base + '/api/reports/weekly/notion', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await (await post({})).json()).exists, true);
  const count = requests.length;
  assert.equal((await (await post({ dryRun: true })).json()).dryRun, true);
  assert.equal(requests.length, count);
  assert.equal((await post({ dryRun: 'false' })).status, 400);
  assert.equal((await post({}, { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post({}, { 'x-forwarded-for': '1.2.3.4' })).status, 403);
  errorStatus = 404;
  const failure = await (await post({})).text();
  assert.match(failure, /Share the page/);
  assert.ok(!failure.includes(token));
  assert.ok(!output.includes(token));
  errorStatus = 0;
  const { TOOLS, createToolRunner } = await import('../mcp/tools.ts');
  assert.equal(TOOLS.find(t => t.name === 'weekly_report').annotations.readOnlyHint, true);
  assert.deepEqual(await createToolRunner(async (method, route) => (await fetch(base + route, { method })).json())('weekly_report', {}), preview);
});
