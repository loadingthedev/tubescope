// Local HTTP security and media input validation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMock, calls } from './mock-youtube.ts';
import { freePort } from './free-port.ts';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-remote-'));
let mock, child, hook, local, pub;
const texts = [];

const j = async (url, opts: Record<string, any> = {}) => {
  const res = await fetch(url, { redirect: 'manual', ...opts });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
};
const tool = async (_, name, args) => {
  const r = await j(local + '/api/tools/' + name, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
  return { isError: r.status >= 400, text: r.body.error || JSON.stringify(r.body) };
};

before(async () => {
  mock = await startMock(0);
  hook = http.createServer((req, res) => {
    let b = '';
    req.on('data', d => (b += d));
    req.on('end', () => {
      try {
        texts.push(JSON.parse(b));
      } catch {
        /* ignore */
      }
      res.end('ok');
    });
  });
  await new Promise(r => hook.listen(0, '127.0.0.1', r));
  const port = await freePort(),
    pport = await freePort();
  local = `http://127.0.0.1:${port}`;
  pub = `http://127.0.0.1:${pport}`;
  const M = `http://127.0.0.1:${mock.port}`;
  child = spawn(process.execPath, ['src/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      TUBESCOPE_PUBLIC_PORT: String(pport),
      TUBESCOPE_DATA_DIR: dataDir,
      TUBESCOPE_NO_SCHEDULER: '1',
      TUBESCOPE_NO_AUTOCONNECT: '1',
      YT_API_BASE: `${M}/youtube/v3`,
      YT_ANALYTICS_BASE: `${M}/v2/reports`,
      YT_SUGGEST_URL: `${M}/complete/search`,
      YT_UPLOAD_BASE: `${M}/upload`,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(local + '/api/status');
      break;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  const r = await j(local + '/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ notify_webhook_url: `http://127.0.0.1:${hook.address().port}/hook`, notify_quiet: 'off', ai_provider: 'none' }),
  });
  assert.equal(r.status, 200);
});
after(() => {
  child?.kill();
  mock?.server.close();
  hook?.close();
});

test('timelines cannot smuggle ffmpeg filters (file writes/reads through the filtergraph)', async () => {
  const t: { access_token?: string } = {};
  const STILL = path.join(os.homedir(), 'Pictures', 'td-test-still.png');
  fs.mkdirSync(path.dirname(STILL), { recursive: true });
  fs.writeFileSync(STILL, 'not really a png');
  const evil = [
    { type: 'box', start: 0, end: 1, color: 'black@0.5:t=fill[q1];[q1]metadata=mode=print:file=/tmp/td-pwned.txt,drawbox=color=black' },
    { type: 'text', text: 'hi', start: 0, end: 1, x: '10:enable=1,drawtext=textfile=/etc/passwd' },
    { type: 'image', src: STILL, start: 0, end: 1, crop: ['0:0,metadata=mode=print:file=/tmp/td-pwned.txt', 0, 10, 10] },
    { type: 'image', src: STILL, start: 0, end: 1, focus: ['0.5,metadata=mode=print:file=/tmp/td-pwned.txt', 0.5] },
    { type: 'captions', start: 0, end: 1, groups: [{ text: 'a', start: 0, end: 1 }], yWhen: [{ from: 0, to: 1, y: '1;evil' }] },
    { type: 'tone', start: 0, kind: "x'];evil" },
  ];
  for (const tr of evil) {
    const r = await tool(t.access_token, 'render_video', { width: 320, height: 240, duration: 1, tracks: [tr] });
    assert.equal(r.isError, true, JSON.stringify(tr));
    assert.match(r.text, /invalid|must be/i);
  }
  assert.equal(fs.existsSync('/tmp/td-pwned.txt'), false);
  fs.rmSync(STILL, { force: true });
});

test('the other ffmpeg tools reject smuggled filters too', async () => {
  const t: { access_token?: string } = {};
  const VID = path.join(os.homedir(), 'Movies', 'td-test-clip.mp4');
  fs.mkdirSync(path.dirname(VID), { recursive: true });
  fs.writeFileSync(VID, 'not really a video');
  const inj = '0.5,metadata=mode=print:file=/tmp/td-pwned2.txt';
  for (const [name, args] of [
    ['media_transcode', { file: VID, focus: [0.5, inj] }],
    ['media_transcode', { file: VID, fps: '30,' + inj }],
    ['speech_segments', { file: VID, minPause: inj }],
    ['speech_segments', { file: VID, noiseDb: '-35:x' }],
    ['extract_frame', { file: VID, width: '320:-1,' + inj }],
  ] as [string, Record<string, unknown>][]) {
    const r = await tool(t.access_token, name, args);
    assert.equal(r.isError, true, name + JSON.stringify(args));
    assert.match(r.text, /invalid/i, name);
  }
  assert.equal(fs.existsSync('/tmp/td-pwned2.txt'), false);
  fs.rmSync(VID, { force: true });
});

test('local port refuses CSRF and DNS rebinding', async () => {
  const csrf = await j(local + '/api/config', {
    method: 'PUT',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
    body: '{"whisper_threads":5}',
  });
  assert.equal(csrf.status, 403);
  const rebound = await new Promise(resolve => {
    const u = new URL(local);
    const req = http.request({ host: u.hostname, port: u.port, path: '/api/config', headers: { host: 'evil.example:' + u.port } }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.end();
  });
  assert.equal(rebound, 421);
  assert.equal(
    (
      await j(local + '/api/config', {
        method: 'PUT',
        headers: { origin: local, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
        body: '{"whisper_threads":5}',
      })
    ).status,
    200
  );
});
