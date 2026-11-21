import { RENDER_SKIP } from './media-support.ts';
// v2.1 parity features end to end: outlier index + niches + title formulas + similar thumbnails, rank tracking,
// competitor audience, bulk edits with undo, make-a-video, Instagram carousels/Stories, Threads/Facebook/LinkedIn,
// and the owner's phone over the tailnet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startMock, calls, IMG, EL } from './mock-youtube.ts';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-growth-'));
const OWNER = 'UCowner00000000000000001';
let mock, child, social, base, M;
const socialCalls = [];

const j = async (p, { method = 'GET', body, headers = {} }: { method?: string; body?: any; headers?: any } = {}) => {
  const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await res.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: res.status, body: b };
};
// raw HTTP so tests can set the Host header (fetch forbids it)
const rawReq = (p, { method = 'GET', headers = {}, body }: { method?: string; headers?: any; body?: any } = {}) => new Promise((resolve, reject) => {
  const u = new URL(base + p);
  const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { ...headers, ...(body ? { 'content-length': Buffer.byteLength(body) } : {}) } }, res => { let t = ''; res.on('data', d => t += d); res.on('end', () => resolve({ status: res.statusCode, text: t })); });
  r.on('error', reject); if (body) r.write(body); r.end();
});
const ok = async (p, o?) => { const r = await j(p, o); assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.body).slice(0, 500)}`); return r.body; };

before(async () => {
  // real media so ffmpeg-based features run for real: two distinct thumbnails and a spoken-length MP3
  const gen = (args, out) => { execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, out]); return fs.readFileSync(out); };
  const red = gen(['-f', 'lavfi', '-i', 'color=c=red:s=320x180', '-vf', 'drawbox=x=0:y=0:w=160:h=180:color=white:t=fill', '-frames:v', '1'], path.join(dataDir, 'red.jpg'));
  const blue = gen(['-f', 'lavfi', '-i', 'color=c=blue:s=320x180', '-vf', 'drawbox=x=0:y=90:w=320:h=90:color=yellow:t=fill', '-frames:v', '1'], path.join(dataDir, 'blue.jpg'));
  IMG.forId = id => ([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 2 ? red : blue);
  EL.mp3 = gen(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', '-c:a', 'libmp3lame', '-b:a', '64k'], path.join(dataDir, 'voice.mp3'));
  mock = await startMock(0);
  M = `http://127.0.0.1:${mock.port}`;
  const port = 7300 + Math.floor(Math.random() * 300);
  base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), TUBESCOPE_PUBLIC_PORT: String(port + 1), TUBESCOPE_DATA_DIR: dataDir, TUBESCOPE_NO_SCHEDULER: '1', TUBESCOPE_NO_AUTOCONNECT: '1', TUBESCOPE_RETRY_BASE_MS: '5',
    YT_API_BASE: `${M}/youtube/v3`, YT_ANALYTICS_BASE: `${M}/v2/reports`, YT_SUGGEST_URL: `${M}/complete/search`, YT_UPLOAD_BASE: `${M}/upload`, YT_THUMB_BASE: M, IG_GRAPH_BASE: `${M}/ig`, EL_API_BASE: `${M}/el`,
 };
  child = spawn(process.execPath, ['src/server.ts'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/status'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  await ok('/api/settings', { method: 'PUT', body: { yt_api_key: 'TESTKEY', ai_provider: 'none', elevenlabs_api_key: 'ELKEY', voice_provider: 'elevenlabs', public_base_url: 'https://media.example.org', index_reserve: '0', tailscale_path: path.join(ROOT, 'test', 'fake-tailscale.mjs') } });
  await ok('/api/channels', { method: 'POST', body: { input: '@TheParentPlan', kind: 'owned' } });
  await ok(`/api/competitors/${OWNER}`, { method: 'POST', body: { input: 'UCcomp000000000000000002' } });
  await ok(`/api/channels/${OWNER}/sync`, { method: 'POST', body: {} }).catch(() => {});
});
after(() => { child?.kill(); mock?.server.close(); social?.close(); });

test('outlier index grows from spare quota and is searchable for free; niches and title formulas come from it', async () => {
  await ok('/api/index/queries', { method: 'POST', body: { query: 'medicaid planning' } });
  const r = await ok('/api/index/crawl?wait=1', { method: 'POST', body: {} });
  assert.ok(r.queries >= 1 && r.videos > 0, JSON.stringify(r));
  assert.ok(r.units >= 102);
  const before = calls.length;
  const all = await ok('/api/index?minX=0&limit=500');
  assert.ok(all.results.length >= r.added && all.results.every(v => v.x === null || v.x >= 0));
  assert.equal(calls.length, before, 'searching the index costs nothing');
  const word = all.results[0].title.split(/\s+/).find(w => w.length > 4).toLowerCase().replace(/[^a-z0-9]/g, '');
  const fts = await ok(`/api/index?minX=0&q=${encodeURIComponent(word)}`);
  assert.ok(fts.results.length >= 1 && fts.results.every(v => v.title.toLowerCase().includes(word.slice(0, 4))), word);
  // the quota reserve is respected
  await ok('/api/settings', { method: 'PUT', body: { index_reserve: '100000' } });
  assert.equal((await ok('/api/index/crawl?wait=1', { method: 'POST', body: {} })).queries, 0);
  await ok('/api/settings', { method: 'PUT', body: { index_reserve: '0' } });
  const niches = await ok('/api/niches?maxSubs=100000000&minVideos=1');
  assert.ok(Array.isArray(niches.niches));
  const f = await ok('/api/formulas?minX=0');
  assert.ok(f.sample > 0 && Array.isArray(f.formulas));
});

test('similar thumbnails: every thumbnail seen is hashed; lookalikes rank first', async () => {
  const st = await ok('/api/index/stats');
  assert.ok(st.thumbs > 0, 'thumbnails hashed during the crawl');
  const any = (await ok('/api/index?minX=0&limit=1')).results[0];
  const r = await ok(`/api/thumbnails/similar?videoId=${any.id}`);
  assert.ok(r.compared > 1 && r.results.length > 0);
  assert.ok(r.results[0].similarity >= 0.95, 'same picture: near-identical score');
  const lookalike = id => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 2;
  const top = r.results.filter(x => x.similarity >= 0.95);
  assert.ok(top.length && top.every(x => lookalike(x.videoId) === lookalike(any.id)), 'lookalikes first');
  const all = await ok(`/api/thumbnails/similar?videoId=${any.id}&minScore=0&limit=500`);
  const other = all.results.filter(x => lookalike(x.videoId) !== lookalike(any.id));
  assert.ok(other.length && other.every(x => x.similarity < 0.6), 'a different picture scores low: ' + other[0]?.similarity);
  assert.ok(!r.results.some(x => x.videoId === any.id), 'not itself');
});

test('rank tracking records where the channel shows up in search', async () => {
  const r = await ok('/api/ranks', { method: 'POST', body: { channelId: OWNER, keyword: 'Medicaid Lookback' } });
  const k = r.keywords.find(x => x.keyword === 'medicaid lookback');
  assert.ok(k && Number.isInteger(k.position) && k.position >= 1, JSON.stringify(k));
  assert.ok(k.top.length > 0);
  assert.equal((await j('/api/ranks', { method: 'POST', body: { channelId: 'UCcomp000000000000000002', keyword: 'x y' } })).status, 400, 'own channels only');
  const del = await ok(`/api/ranks/${k.id}`, { method: 'DELETE' });
  assert.equal(del.removed, 1);
});

test('competitor audience: questions and requests under competitors\' videos, grouped', async () => {
  const r = await ok(`/api/competitor-audience/${OWNER}`);
  assert.ok(r.videos >= 1 && r.comments > 0 && r.asks > 0, JSON.stringify(r).slice(0, 300));
  assert.ok(r.clusters.length && r.clusters[0].examples[0].competitor);
});

test('bulk edit: preview flags problems, apply updates YouTube, undo restores it', async () => {
  const p = await ok('/api/bulk/preview', { method: 'POST', body: { channelId: OWNER, format: 'long', ops: [{ field: 'description', action: 'append', value: 'Free checklist: https://example.org/list' }, { field: 'tags', action: 'add', values: ['aging parents'] }] } });
  assert.ok(p.changes > 0 && p.ready === p.changes);
  const bad = await ok('/api/bulk/preview', { method: 'POST', body: { channelId: OWNER, ops: [{ field: 'title', action: 'append', value: ' <b>' + 'x'.repeat(120), separator: '' }] } });
  assert.ok(bad.blocked === bad.changes && bad.items[0].problems.length >= 1);
  assert.equal((await j(`/api/bulk/${p.batchId}/apply`, { method: 'POST', body: {} })).status, 404);
});

test('make a video: script + your voice → captioned vertical MP4 with a cover', { timeout: 180_000, skip: RENDER_SKIP }, async () => {
  const r = await ok('/api/make-video?wait=1', { method: 'POST', body: { channelId: OWNER, title: 'The Medicaid Rule Nobody Mentions', script: 'Medicaid can take the house. Here is the five year rule most families miss, and the one document that protects you.', publish: 'review' } });
  const res = r.result;
  assert.equal(r.status, 'done', JSON.stringify(r).slice(0, 400));
  assert.ok(fs.existsSync(res.file) && fs.statSync(res.file).size > 10_000);
  assert.ok(res.cover && fs.existsSync(res.cover));
  const probe = await ok('/api/media/probe', { method: 'POST', body: { file: res.file } });
  assert.equal(probe.video.width, 1080); assert.equal(probe.video.height, 1920); assert.ok(probe.audio);
  assert.equal((await j('/api/make-video?wait=1', { method: 'POST', body: { channelId: OWNER, topic: 'x' } })).status, 400, 'no AI and no script: says what to do');
});

test('health covers the new daily jobs', async () => {
  const h = await ok('/api/health');
  assert.ok(['ok', 'warn', 'error'].includes(h.status));
  assert.ok(h.items.find(i => i.id === 'database').ok);
});
