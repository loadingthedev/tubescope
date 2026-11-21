import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.TUBESCOPE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'td-readonly-'));
const { ytWrite } = await import('../src/youtube/client.js');
const { setThumbnail } = await import('../src/services/packaging.js');
const { SCOPES, authUrl } = await import('../src/youtube/oauth.js');
const { db, setSetting } = await import('../src/db.js');
const { settings } = await import('../src/services/autopilot.js');
const cfg = await import('../src/services/settings-schema.js');

test('every YouTube write throws before fetch, including missing options and thumbnail uploads', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  try {
    for (const endpoint of ['videos.update', 'comments.insert', 'playlists.insert', 'playlistItems.insert', 'thumbnails.set', 'anything']) {
      await assert.rejects(ytWrite(endpoint, { channelId: 'owner' }), { message: 'Tubescope fork is read-only: writes to YouTube are disabled' });
    }
    await assert.rejects(ytWrite(), /Tubescope fork is read-only: writes to YouTube are disabled/);
    await assert.rejects(setThumbnail('owner', 'video', '/missing.jpg'), /Tubescope fork is read-only: writes to YouTube are disabled/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('OAuth requests only read-only scopes; saved auto mode cannot enable writes', () => {
  assert.deepEqual(SCOPES, ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly', 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly']);
  setSetting('google_client_id', 'test');
  const url = new URL(authUrl());
  assert.equal(url.searchParams.get('scope'), SCOPES.join(' '));
  assert.notEqual(url.searchParams.get('include_granted_scopes'), 'true');
  assert.equal(cfg.BY_KEY.ai_provider.default, 'none');
  assert.deepEqual(cfg.BY_KEY.autopilot_mode.values, ['suggest', 'off']);
  assert.equal(cfg.BY_KEY.autopilot_mode.default, 'suggest');
  setSetting('autopilot_mode', 'auto');
  assert.equal(settings().mode, 'suggest');
  assert.throws(() => cfg.validate('autopilot_mode', 'auto'), /must be one of/);
});
