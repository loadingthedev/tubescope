// Local setup, configuration, maintenance and tool routes.
import { Router } from 'express';
import { getSetting, DATA_DIR } from '../db.ts';
import { ytGet } from '../youtube/client.ts';
import { authUrl } from '../youtube/oauth.ts';
import * as ch from '../services/channels.ts';
import * as comp from '../services/competitors.ts';
import * as ai from '../services/ai.ts';
import * as voice from '../services/voice.ts';
import * as notifier from '../services/notify.ts';
import * as transcribe from '../services/transcribe.ts';
import * as ren from '../services/render.ts';
import * as cfg from '../services/settings-schema.ts';
import { TOOLS, createToolRunner } from '../../mcp/tools.ts';
import { openapi } from '../services/openapi.ts';
import * as health from '../services/health.ts';
import * as backup from '../services/backup.ts';
import * as jobs from '../services/jobs.ts';

export const setup = Router();
const w = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const isRemote = req => req.headers['x-tubescope-origin'] === 'remote';

// ---------- health, jobs, backups, updates ----------
setup.get(
  '/health',
  w(async (req, res) => res.json(await health.check({ deep: req.query.deep === '1' })))
);
setup.post(
  '/health/doctor',
  w(async (req, res) => res.json(await health.doctor()))
);
setup.get('/jobs', (req, res) => res.json({ jobs: jobs.status(), overdue: jobs.overdue() }));
setup.post(
  '/jobs/:name/run',
  w(async (req, res) => {
    const p = jobs.runJob(String(req.params.name), 'manual');
    if (req.query.wait === '1') return res.json({ ok: true, result: await p });
    p.catch(() => {});
    res.json({ started: req.params.name });
  })
);
setup.get('/backups', (req, res) => res.json({ backups: backup.list(), dir: backup.BACKUP_DIR }));
setup.post(
  '/backups',
  w(async (req, res) => res.json(await backup.create({ force: true })))
);
setup.post(
  '/backups/restore',
  w(async (req, res) => {
    const r = backup.stageRestore(req.body?.file);
    res.json({ ...r, restartRequired: true });
  })
);
// ---------- setup checklist ----------
setup.get(
  '/setup',
  w(async (req, res) => {
    const owned = ch.listChannels('owned');
    const items = [];
    const add = (id, label, ok, detail, next = null, required = false) => items.push({ id, label, ok: !!ok, required, detail, next: ok ? null : next });
    add(
      'youtube_api_key',
      'YouTube Data API key',
      !!getSetting('yt_api_key'),
      getSetting('yt_api_key') ? 'set' : 'missing',
      'Create a free key: console.cloud.google.com → APIs & Services → enable "YouTube Data API v3" → Credentials → Create API key. Then update_settings {yt_api_key}.',
      true
    );
    add(
      'google_oauth',
      'Google sign-in app (read-only analytics)',
      getSetting('google_client_id') && getSetting('google_client_secret'),
      getSetting('google_client_id') ? 'client set' : 'missing',
      'Google Cloud → Credentials → Create OAuth client ID (type "Web application", redirect URI http://localhost:4949/oauth/callback; add yourself as a test user on the consent screen). Then update_settings {google_client_id, google_client_secret}.'
    );
    const a = await ai.status();
    add(
      'ai',
      'AI provider (ideas, titles, scoring)',
      a.ok,
      `${a.provider}: ${a.detail}`,
      'Install Claude Code on the Mac (npm i -g @anthropic-ai/claude-code, sign in once) or update_settings {ai_provider:"anthropic", anthropic_api_key}.',
      true
    );
    add(
      'owned_channel',
      'Your channels',
      owned.length > 0,
      owned.map(c => c.title).join(', ') || 'none',
      'add_channel {input:"@yourhandle", kind:"owned"} for each channel you own.',
      true
    );
    for (const c of owned)
      add(
        `connected_${c.id}`,
        `${c.title}: connected with Google`,
        c.authorized,
        c.authorized ? c.oauth_email || 'connected' : 'not connected — no analytics or CTR',
        'connect_account {service:"google"} and open the link on the Mac, signing in with the Google account that owns this channel.'
      );
    const competitors = owned.reduce((n, c) => n + comp.listCompetitors(c.id).length, 0);
    add(
      'competitors',
      'Competitors tracked',
      competitors > 0,
      `${competitors}`,
      'similar_channels {channelId} to find them, then add_channel {input, kind:"competitor"}.'
    );
    const v = voice.status();
    add(
      'voiceover',
      'Voiceover (HeyGen / ElevenLabs)',
      v.configured,
      v.configured ? v.provider : 'no key',
      'update_settings {heygen_api_key, heygen_voice_id} (or elevenlabs_api_key).'
    );
    const n = notifier.channelsConfigured();
    add(
      'notifications',
      'Phone alerts',
      n.length > 0,
      n.join(', ') || 'none',
      'Where alerts go also decides who can approve new AI apps, so it is set on the Mac: Tubescope → Virality radar → Autopilot → Phone alerts (iMessage number, or a topic in the free ntfy app). Then test_notification.'
    );
    const e = transcribe.engineStatus();
    add(
      'transcription',
      'Local transcription (Shorts, hook scoring)',
      !!e.whisper,
      e.whisper ? `whisper.cpp ${e.modelReady ? '+ model' : '(model downloads on first use)'}` : 'whisper.cpp not installed',
      'On the Mac: brew install whisper-cpp'
    );
    const r = ren.toolStatus();
    add('ffmpeg', 'ffmpeg (render, Shorts, thumbnails)', r.ready, r.ffmpeg || 'not found', 'On the Mac: brew install ffmpeg', true);
    const tz = getSetting('timezone', '');
    add(
      'timezone',
      'Time zone',
      !!tz,
      tz || `not set (using ${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
      `update_settings {timezone:"${Intl.DateTimeFormat().resolvedOptions().timeZone}"}`
    );
    const missing = items.filter(i => !i.ok);
    const next = missing.find(i => i.required) || missing[0] || null;
    res.json({ ready: !items.some(i => i.required && !i.ok), done: items.length - missing.length, total: items.length, next, items });
  })
);

setup.get(
  '/setup/connect/:service',
  w(async (req, res) => {
    const s = req.params.service;
    const brand = req.query.channel
      ? ch.listChannels('owned').find(c =>
          [
            c.id,
            String(c.title).toLowerCase(),
            String(c.handle || '')
              .toLowerCase()
              .replace(/^@/, ''),
          ].includes(String(req.query.channel).toLowerCase().replace(/^@/, ''))
        )
      : null;
    if (req.query.channel && !brand) return res.status(400).json({ error: `"${req.query.channel}" is not one of your channels` });
    if (s === 'google') {
      if (!getSetting('google_client_id'))
        return res.status(400).json({ error: 'Set google_client_id and google_client_secret first (setup_status explains how).' });
      return res.json({
        service: s,
        url: authUrl(),
        openOn: 'the Mac running Tubescope (the sign-in returns to http://localhost:4949)',
        next: 'Sign in with the Google account that owns the channel and allow access. Tubescope links every channel on that account. Then call setup_status.',
      });
    }
    res.status(400).json({ error: 'service must be google' });
  })
);

// ---------- validated settings ----------
setup.get('/config', (req, res) => res.json({ groups: [...new Set(cfg.SCHEMA.map(s => s.group))], settings: cfg.describe(req.query.group || null) }));
setup.put(
  '/config',
  w(async (req, res) => {
    const changed = cfg.apply(req.body || {}, { remote: isRemote(req) });
    const out: { changed: ReturnType<typeof cfg.apply>; yt_api_key?: string } = { changed };
    if (changed.some(c => c.key === 'yt_api_key') && getSetting('yt_api_key')) {
      try {
        await ytGet('videoCategories.list', { part: 'snippet', regionCode: 'US' }, { ttl: 0, noCache: true });
        out.yt_api_key = 'works';
      } catch (e) {
        out.yt_api_key = `saved, but YouTube rejected it: ${e.message}`;
      }
    }
    res.json(out);
  })
);

// ---------- tools over plain HTTP on the Mac (same tools as MCP) + OpenAPI ----------
const localRunner = req =>
  createToolRunner(async (method, p, body) => {
    const port = Number(process.env.PORT || getSetting('port', 4949));
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(isRemote(req) ? { 'x-tubescope-origin': 'remote' } : {}) },
    });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = { raw: text };
    }
    if (!r.ok) throw new Error(j?.error || `${method} ${p} → ${r.status}`);
    return j;
  });
setup.get('/tools', (req, res) => res.json(TOOLS));
setup.post(
  '/tools/:name',
  w(async (req, res) => {
    if (!TOOLS.some(t => t.name === req.params.name)) return res.status(404).json({ error: `unknown tool ${req.params.name}` });
    try {
      res.json(await localRunner(req)(req.params.name, req.body || {}));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  })
);
setup.get('/openapi.json', (req, res) =>
  res.json(openapi({ base: `http://localhost:${Number(process.env.PORT || getSetting('port', 4949))}`, profile: req.query.for || 'all' }))
);

setup.get('/brands', (req, res) => res.json({ brands: ch.listChannels('owned').map(c => ({ channelId: c.id, title: c.title, connected: !!c.authorized })) }));
