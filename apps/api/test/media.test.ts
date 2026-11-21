// Transcription, best-time suggestions, portfolio summaries and hook backtests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMock, calls, IG, UPLOADED } from './mock-youtube.ts';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const FAKE_CLAUDE = path.join(ROOT, 'test', 'fake-claude.ts');
const FAKE_WHISPER = path.join(ROOT, 'test', 'fake-whisper.ts');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-shorts-'));
const OWNER = 'UCowner00000000000000001',
  COMP = 'UCcomp000000000000000002';
const FFMPEG = ['/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'].find(f => fs.existsSync(f));
const FFPROBE = ['/usr/local/bin/ffprobe', '/usr/bin/ffprobe', '/opt/homebrew/bin/ffprobe'].find(f => fs.existsSync(f));
let mock, child, base, hook, db;
const received = [];

async function api(p, { method = 'GET', body }: { method?: string; body?: any } = {}, retry = true) {
  let res;
  // A keep-alive socket can be closed by the server while the test was busy (e.g. generating the source video).
  try {
    res = await fetch(base + '/api' + p, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (retry && e.cause?.code === 'UND_ERR_SOCKET') return api(p, { method, body }, false);
    throw e;
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}
const ok = async (p, o?) => {
  const r = await api(p, o);
  assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.json).slice(0, 600)}`);
  return r.json;
};
const waitFor = async (fn, ms = 3000) => {
  for (let t = 0; t < ms; t += 50) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return fn();
};
const vidId = i => ('owne' + String(i).padStart(7, '0')).slice(0, 11);
const probe = f =>
  JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', f]).toString());
const SRC = path.join(dataDir, 'episode-2.mp4');

let port;
async function startServer() {
  port ??= 5700 + Math.floor(Math.random() * 250);
  base = `http://127.0.0.1:${port}`;
  const M = `http://127.0.0.1:${mock.port}`;
  child = spawn(process.execPath, ['src/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      TUBESCOPE_DATA_DIR: dataDir,
      TUBESCOPE_NO_SCHEDULER: '1',
      TUBESCOPE_NO_AUTOCONNECT: '1',
      TZ: 'America/New_York',
      YT_API_BASE: `${M}/youtube/v3`,
      YT_ANALYTICS_BASE: `${M}/v2/reports`,
      YT_SUGGEST_URL: `${M}/complete/search`,
      YT_UPLOAD_BASE: `${M}/upload`,
      YT_REPORTING_BASE: `${M}/reporting/v1`,
      IG_GRAPH_BASE: `${M}/ig`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(base + '/api/status');
      break;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
}
before(async () => {
  mock = await startMock(0);
  hook = http.createServer((req, res) => {
    let b = '';
    req.on('data', d => (b += d));
    req.on('end', () => {
      received.push(JSON.parse(b));
      res.end('ok');
    });
  });
  await new Promise(r => hook.listen(0, '127.0.0.1', r));
  await startServer();
  const model = path.join(dataDir, 'ggml-test.bin');
  fs.writeFileSync(model, 'not a real model');
  await ok('/settings', {
    method: 'PUT',
    body: {
      yt_api_key: 'TESTKEY',
      ai_provider: 'claude-cli',
      claude_cli_path: FAKE_CLAUDE,
      default_country: 'US',
      timezone: 'America/New_York',
      notify_webhook_url: `http://127.0.0.1:${hook.address().port}/hook`,
      notify_quiet: '',
      radar_watch_days: '30',
      radar_watch_competitor_days: '30',
      whisper_path: FAKE_WHISPER,
      whisper_model: model,
      autopilot_mode: 'off',
    },
  });
  await ok('/channels', { method: 'POST', body: { input: '@TheParentPlan', kind: 'owned', maxVideos: 100 } });
  await ok(`/competitors/${OWNER}`, { method: 'POST', body: { input: COMP } });
  const { Database } = await import('bun:sqlite');
  db = new Database(path.join(dataDir, 'tubescope.sqlite'), { strict: true, create: true });
  db.prepare('UPDATE channels SET oauth_json = ? WHERE id = ?').run(
    JSON.stringify({ access_token: 'tok', refresh_token: 'rt', expires_at: Date.now() + 3600e3 }),
    OWNER
  );
  if (FFMPEG)
    execFileSync(FFMPEG, [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=1280x720:rate=30:duration=60',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=330:duration=60',
      '-shortest',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      SRC,
    ]);
});
after(() => {
  child.kill();
  mock.server.close();
  hook.close();
  db?.close();
});

test('local transcription: ffmpeg → whisper word timings, cached, used as a source file lookup', { skip: !FFMPEG }, async () => {
  assert.equal((await api(`/transcripts/${vidId(2)}`)).status, 404);
  assert.equal((await api(`/transcripts/${vidId(2)}`, { method: 'POST', body: {} })).status, 404, 'no source file and captions not allowed');
  await ok('/autopilot/assets', { method: 'POST', body: { videoId: vidId(2), kind: 'source', path: SRC } });
  const t = await ok(`/transcripts/${vidId(2)}`, { method: 'POST', body: {} });
  assert.equal(t.source, 'whisper');
  assert.ok(t.words.length > 80, 'word-level timings: ' + t.words.length);
  assert.ok(t.words.every((w, i) => w.end > w.start && (i === 0 || w.start >= t.words[i - 1].start)));
  assert.ok(Math.abs(t.words.at(-1).end - 60) < 1, 'covers the whole file');
  assert.equal(t.words[0].text, 'Medicaid');
  assert.deepEqual((await ok(`/transcripts/${vidId(2)}`)).words.length, t.words.length, 'cached');
});

test('best publish times: learned from history, spaced and daytime', { skip: !FFMPEG }, async () => {
  const s = await ok(`/slots/${OWNER}?format=long&count=3`);
  assert.equal(s.next.length, 3);
  const at = s.next.map(x => Date.parse(x.at));
  assert.ok(
    at.every(t => t > Date.now() + 110 * 60000),
    'at least 2 h out'
  );
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 20 * 3600e3, 'spaced ≥ 20 h');
  assert.ok(
    s.next.every(x => {
      const h = Number(new Date(x.at).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
      return h >= 6;
    }),
    'never midnight–6 am local'
  );
  assert.ok(s.grid.blocks.length && s.grid.weekdays.length);
});

test('all channels on one board + weekly summary to the phone', async () => {
  const today = new Date(),
    day = d => new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
  const ins = db.prepare(
    'INSERT INTO snapshots (entity_type, entity_id, taken_at, day, views, subs) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(entity_type, entity_id, day) DO UPDATE SET views = excluded.views, subs = excluded.subs'
  );
  ins.run('channel', OWNER, new Date().toISOString(), day(14), 170000, 1100);
  ins.run('channel', OWNER, new Date().toISOString(), day(7), 176000, 1180);
  ins.run('channel', OWNER, new Date().toISOString(), day(0), 184000, 1240);
  const o = await ok('/portfolio');
  assert.equal(o.channels.length, 1);
  const c = o.channels[0];
  assert.equal(c.views7, 8000);
  assert.equal(c.views7Prev, 6000);
  assert.ok(Math.abs(c.views7Change - 1 / 3) < 1e-9);
  assert.equal(c.subs7, 60);
  assert.ok(c.latest && c.latest.title);
  assert.ok(c.ypp && c.ypp.watchHoursPct >= 0, 'monetization progress for a connected channel');
  const r = await ok('/portfolio/weekly-summary', { method: 'POST', body: { send: true } });
  assert.ok(/The Parent Plan: 8,000 views \(\+33% vs last week\), \+60 subs/.test(r.text), r.text);
  assert.deepEqual(r.sent.sent, ['webhook']);
  assert.ok(await waitFor(() => received.some(m => m.title === 'Tubescope weekly summary')));
});

test('hook backtest: calibration rates opening lines from local transcripts', { skip: !FFMPEG }, async () => {
  const job = await ok(`/radar/calibrate/${OWNER}?wait=1`, { method: 'POST', body: { ai: true, minAgeDays: 1 } });
  assert.equal(job.status, 'done', job.error);
  const metrics = job.result.metrics;
  assert.ok(metrics.hooks, 'hook stage ran: ' + JSON.stringify(Object.keys(metrics)));
  assert.ok(metrics.hooks.used && metrics.hooks.rated >= 1, JSON.stringify(metrics.hooks));
  assert.ok(metrics.hooks.captionsUsed <= 10, 'caption downloads stay within the budget');
  assert.ok(metrics.sample.withHook >= 1, 'labelled uploads carry a hook rating');
});

test('MCP exposes best times and the all-channels board', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'mcp', 'tools.ts'), 'utf8');
  for (const t of ['portfolio', 'best_publish_time']) assert.ok(src.includes(`'${t}'`) || src.includes(`"${t}"`) || src.includes(`name: '${t}'`), t);
  const guide = await (await fetch(base + '/api/agent')).text();
  assert.ok(/read-only YouTube research desk/.test(guide));
});
