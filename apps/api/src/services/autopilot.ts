// Diagnose lagging uploads and suggest titles and thumbnails for manual use.
import fs from 'node:fs';
import path from 'node:path';
import { db, getSetting, DATA_DIR } from '../db.ts';
import { isAuthorized } from '../youtube/oauth.ts';
import { getChannel, syncVideos } from './channels.ts';
import { assertThumbPath } from './packaging.ts';
import { ytGet } from '../youtube/client.ts';
import { scorePackages, buildCorpus, aiAvailable } from './radar.ts';
import * as reach from './reach.ts';
import * as render from './render.ts';
import * as ai from './ai.ts';

db.exec(`
CREATE TABLE IF NOT EXISTS autopilot_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  trigger TEXT,
  diagnosis_json TEXT,
  mode TEXT,
  status TEXT NOT NULL,          -- applied | suggested | skipped | failed | reverted | kept
  message TEXT,
  before_title TEXT, before_thumb_path TEXT, before_thumb_url TEXT, before_score REAL,
  after_title TEXT, after_thumb_path TEXT, after_score REAL,
  changed TEXT,                  -- title | thumbnail | title,thumbnail
  candidates_json TEXT,
  pace_at REAL,
  ctr_before REAL, ctr_after REAL, imp_before INTEGER, imp_after INTEGER,
  applied_at TEXT, evaluated_at TEXT, outcome TEXT
);
CREATE INDEX IF NOT EXISTS idx_autopilot_video ON autopilot_actions(video_id, id);
CREATE TABLE IF NOT EXISTS autopilot_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT,
  video_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- thumbnail | source
  path TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_autopilot_assets_video ON autopilot_assets(video_id);
`);

export function settings() {
  return {
    mode: getSetting('autopilot_mode', 'suggest') === 'off' ? 'off' : 'suggest', // suggest | off
    minGain: Number(getSetting('autopilot_min_gain', 8)), // radar points a candidate must win by
    minHours: Number(getSetting('autopilot_min_hours', 24)),
    maxDays: Number(getSetting('autopilot_max_days', 7)),
    shorts: getSetting('autopilot_shorts', '0') === '1',
    titles: getSetting('autopilot_titles', '1') === '1',
    thumbnails: getSetting('autopilot_thumbnails', '1') === '1',
  };
}

const THUMBS = () => path.join(DATA_DIR, 'thumbs');
const fmtCtr = v => (v === null || v === undefined ? 'n/a' : v.toFixed(1) + '%');
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** Why is this upload lagging? Compares the video's launch days with the channel's usual launch days (same window). */
export function diagnose(video, { paceIndex = null }: { paceIndex?: number } = {}) {
  const lc = reach.launchComparison(video.id, video.channel_id, { isShort: !!video.is_short });
  const r = lc?.video || null,
    base = lc?.baseline || null;
  const out: {
    paceIndex: number;
    ctr: number;
    impressions: number;
    ctrBaseline: number;
    impressionsBaseline: number;
    reachDays: number;
    ctrRatio?: number;
    impRatio?: number;
  } = {
    paceIndex,
    ctr: r?.ctr ?? null,
    impressions: r?.impressions ?? null,
    ctrBaseline: base?.ctr ?? null,
    impressionsBaseline: base?.impressions ?? null,
    reachDays: lc?.days ?? 0,
  };
  if (r && r.ctr !== null && r.impressions >= 200 && base) {
    out.ctrRatio = r.ctr / base.ctr;
    out.impRatio = r.impressions / Math.max(1, base.impressions);
    const win = `first ${lc.days} day${lc.days > 1 ? 's' : ''}`;
    if (out.ctrRatio < 0.85)
      return {
        ...out,
        kind: 'packaging',
        text: `CTR ${fmtCtr(r.ctr)} vs your usual ${fmtCtr(base.ctr)} (${win}): people see it but don't click. Title/thumbnail is the lever.`,
      };
    if (out.impRatio < 0.7)
      return {
        ...out,
        kind: 'reach',
        text: `People who see it click at your usual rate (${fmtCtr(r.ctr)}), but YouTube showed it ${Math.round((1 - out.impRatio) * 100)}% less than your usual ${win}. Packaging is not the problem; push it yourself (community post, a Short pointing to it, end screens).`,
      };
    return {
      ...out,
      kind: 'other',
      text: `CTR (${fmtCtr(r.ctr)}) and impressions are near your usual ${win}; the gap is likely watch time. Check the retention curve for an early drop.`,
    };
  }
  return {
    ...out,
    kind: 'unknown',
    text: `No launch CTR yet (YouTube's reach reports arrive ~2 days after a day ends). Views are at ${paceIndex === null ? '?' : paceIndex.toFixed(2) + '×'} your usual pace, so the packaging is the fastest lever to test.`,
  };
}

function sourceFileFor(videoId) {
  const a = db.prepare("SELECT path FROM autopilot_assets WHERE video_id = ? AND kind = 'source' ORDER BY id DESC LIMIT 1").get(videoId);
  if (a && fs.existsSync(a.path)) return a.path;
  return null;
}

/** The video as it is on YouTube right now (owner token when connected), never the possibly stale local copy. */
async function liveSnippet(video) {
  const res = await ytGet(
    'videos.list',
    { part: 'snippet', id: video.id },
    { ttl: 0, noCache: true, channelId: isAuthorized(video.channel_id) ? video.channel_id : null }
  );
  const sn = res.items?.[0]?.snippet;
  if (!sn) throw new Error('Video not found on YouTube');
  const th = sn.thumbnails || {};
  return {
    snippet: sn,
    title: sn.title,
    description: sn.description || '',
    thumbnailUrl: (th.maxres || th.standard || th.high || th.medium || th.default)?.url || video.thumbnail,
  };
}

/** Fresh copy of the live thumbnail under a unique name (the shared image cache could hold an older version). */
async function snapshotThumbnail(url, videoId) {
  if (!url) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`thumbnail download ${res.status}`);
  fs.mkdirSync(THUMBS(), { recursive: true });
  const file = path.join(THUMBS(), `autopilot-orig-${videoId}-${stamp()}.jpg`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function generateTitles(video, diag) {
  const corpus = buildCorpus(video.channel_id);
  const winners = corpus
    .filter(r => r.own && r.y !== null && r.y >= 0.6)
    .sort((a, b) => b.y - a.y)
    .slice(0, 6)
    .map(r => `- ${r.title} (${(2 ** r.y).toFixed(1)}× usual)`);
  const prompt = `A YouTube video is underperforming and needs a better title. Rewrite the packaging WITHOUT changing what the video is about.
Current title: ${video.title}
Description (source of truth for what the video delivers — do not add claims beyond it): """${String(video.description || '').slice(0, 900)}"""
Diagnosis: ${diag.text}
This channel's best-performing titles (learn the style, never copy):
${winners.join('\n') || '- none yet'}
Write 4 alternative titles, each under 60 characters and each a different angle: (1) specific outcome or number, (2) curiosity gap, (3) stakes or warning, (4) the viewer's own question in their words. Every title must be honest to the video.
Also write thumbText: 2-4 punchy words for the thumbnail that COMPLEMENT the strongest title (never repeat it).
Return JSON: {"titles":[{"title":"...","angle":"..."}],"thumbText":"..."}`;
  const out = await ai.ask('autopilot_titles', prompt, { json: true });
  const seen = new Set([video.title.toLowerCase()]);
  const titles = (out.titles || [])
    .map(t =>
      String(t.title || '')
        .trim()
        .slice(0, 100)
    )
    .filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, 4);
  return { titles, thumbText: String(out.thumbText || '').slice(0, 40) };
}

async function thumbnailCandidates(video, thumbText) {
  const out = [];
  for (const a of db.prepare("SELECT * FROM autopilot_assets WHERE video_id = ? AND kind = 'thumbnail' ORDER BY id").all(video.id)) {
    try {
      out.push({ path: assertThumbPath(a.path), label: a.label || 'from your thumbnail bank' });
    } catch {
      /* moved or deleted */
    }
  }
  const src = sourceFileFor(video.id);
  if (src && out.length < 3) {
    const run = stamp(); // unique per run: an earlier pending suggestion keeps pointing at the image that was scored
    try {
      const pr = await render.probe(src);
      const dur = Number(pr.duration) || 60;
      for (const frac of [0.22, 0.48, 0.71]) {
        if (out.length >= 3) break;
        const file = path.join(THUMBS(), `autopilot-${video.id}-${run}-${Math.round(frac * 100)}.jpg`);
        await render.thumbnailCard({ file: src, at: Math.max(0.5, dur * frac).toFixed(2), text: thumbText, output: file });
        out.push({ path: file, label: `frame at ${Math.round(frac * 100)}% + "${thumbText}"` });
      }
    } catch (e) {
      out.push({ error: `Could not cut frames from ${path.basename(src)}: ${e.message}` });
    }
  }
  return out;
}

function attempts(videoId) {
  return db.prepare('SELECT * FROM autopilot_actions WHERE video_id = ? ORDER BY id').all(videoId);
}
const OPEN = ['applied', 'suggested', 'kept', 'applying', 'reverting'];

/** Guardrails shared by the hourly watch and manual runs. `force` (manual) skips only the lag/diagnosis checks. */
export function guardrails(video, { force = false }: { force?: boolean } = {}) {
  const s = settings();
  if (s.mode === 'off') return 'autopilot is off';
  if (video.is_short && !s.shorts) return 'Shorts are excluded (Autopilot settings → Include Shorts)';
  const prev = attempts(video.id).filter(a => !/^Could not read the live video/.test(a.message || ''));
  if (prev.some(a => OPEN.includes(a.status))) return 'already has a suggestion';
  if (!force && prev.some(a => a.status === 'reverted')) return 'an earlier change was reverted, so the autopilot will not try again on its own (use Run now)';
  if (prev.length >= 2 && !force) return 'two attempts already';
  if (prev.length && !force && Date.now() - Date.parse(prev.at(-1).created_at.replace(' ', 'T') + 'Z') < 24 * 3600e3) return 'tried less than 24 h ago';
  return null;
}

/** Decide whether autopilot should act on this upload now (hourly watch). */
export function shouldRun(video, { ageHours, confidence, paceIndex }: { ageHours?: number; confidence?: string; paceIndex?: number }) {
  const s = settings();
  const blocked = guardrails(video);
  if (blocked) return { run: false, why: blocked };
  if (ageHours < s.minHours || ageHours > s.maxDays * 24) return { run: false, why: 'outside the age window' };
  const d = diagnose(video, { paceIndex });
  const lagging = paceIndex !== null && paceIndex < 0.6 && confidence !== 'low' && confidence !== 'none';
  const lowCtr = d.kind === 'packaging' && d.ctrRatio < 0.75 && ageHours >= 48;
  if (!lagging && !lowCtr) return { run: false, why: 'not lagging', diagnosis: d };
  if (d.kind === 'reach' || d.kind === 'other') return { run: false, why: 'packaging is not the problem', diagnosis: d, notifyOnly: true };
  return { run: true, diagnosis: d, trigger: lowCtr ? 'low CTR' : `pace ${paceIndex.toFixed(2)}×` };
}

/** Run the autopilot for one owned video. force = manual "run now" (skips the lag check, never the guardrails). */
const inFlight = new Map(); // videoId → promise: a manual run and the hourly watch never act on one video twice
export function runForVideo(videoId: string, opts: Parameters<typeof runForVideoInner>[1] = {}) {
  if (inFlight.has(videoId)) return inFlight.get(videoId);
  const p = runForVideoInner(videoId, opts).finally(() => inFlight.delete(videoId));
  inFlight.set(videoId, p);
  return p;
}
async function runForVideoInner(
  videoId,
  {
    force = false,
    trigger = 'manual',
    paceIndex = null,
    diagnosis = null,
  }: { force?: boolean; trigger?: string; paceIndex?: number; diagnosis?: ReturnType<typeof diagnose> } = {}
) {
  let video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
  if (!video) {
    // A fresh upload the daily sync hasn't stored yet: pull the newest uploads of the owning channel (≈2 quota units).
    const w = db.prepare('SELECT channel_id FROM radar_watch WHERE video_id = ?').get(videoId);
    if (w) {
      try {
        await syncVideos(w.channel_id, { maxVideos: 10, force: true });
      } catch {
        /* fall through */
      }
    }
    video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
  }
  if (!video) throw Object.assign(new Error('Video not synced'), { status: 404 });
  const ch = getChannel(video.channel_id);
  if (!ch || ch.kind !== 'owned') throw Object.assign(new Error('Autopilot only works on your own channels'), { status: 400 });
  const s = settings();
  const record = fields => {
    const cols = Object.keys(fields);
    const r = db.prepare(`INSERT INTO autopilot_actions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => fields[c]));
    return getAction(r.lastInsertRowid);
  };
  const open = attempts(video.id).find(a => OPEN.includes(a.status));
  if (open) return getAction(open.id); // one open change per video
  const blocked = guardrails(video, { force });
  if (blocked) throw Object.assign(new Error(`Autopilot won't run on this video: ${blocked}.`), { status: 409 });
  // Work from what is live on YouTube now, not the local copy (the owner may have retitled it since the last sync).
  let liveError = null;
  try {
    const live = await liveSnippet(video);
    video = { ...video, title: live.title, description: live.description, thumbnail: live.thumbnailUrl };
    db.prepare('UPDATE videos SET title = ? WHERE id = ?').run(live.title, video.id);
  } catch (e) {
    liveError = e.message;
  }
  const diag = diagnosis || diagnose(video, { paceIndex });
  const base = {
    channel_id: video.channel_id,
    video_id: video.id,
    trigger: force ? 'manual' : trigger,
    diagnosis_json: JSON.stringify(diag),
    mode: s.mode,
    before_title: video.title,
    before_thumb_url: video.thumbnail,
    pace_at: paceIndex,
  };
  if (liveError)
    return record({
      ...base,
      status: 'skipped',
      message: `Could not read the live video from YouTube (${liveError}), so nothing was changed. It will try again next hour.`,
    });
  if (!aiAvailable()) return record({ ...base, status: 'skipped', message: 'Autopilot needs the AI provider (Settings → AI) to write and rate new titles.' });
  if (!force && (diag.kind === 'reach' || diag.kind === 'other')) return record({ ...base, status: 'skipped', message: diag.text });

  let curThumb = null;
  try {
    curThumb = await snapshotThumbnail(video.thumbnail, video.id);
  } catch {
    curThumb = null;
  }
  let gen;
  try {
    gen = await generateTitles(video, diag);
  } catch (e) {
    return record({ ...base, before_thumb_path: curThumb, status: 'failed', message: 'Title generation failed: ' + e.message });
  }
  const thumbs = s.thumbnails ? await thumbnailCandidates(video, gen.thumbText) : [];
  const usableThumbs = thumbs.filter(t => t.path).slice(0, 3);
  const packages = [{ key: 'cur', title: video.title, image: curThumb }];
  if (s.titles) gen.titles.forEach((t, i) => packages.push({ key: 't' + (i + 1), title: t, image: curThumb }));
  usableThumbs.forEach((t, i) => packages.push({ key: 'i' + (i + 1), title: video.title, image: t.path }));
  const { results, notes } = await scorePackages(video.channel_id, packages, { format: video.is_short ? 'short' : 'long' });
  const cur = results.cur;
  const titleWin = Object.values(results)
    .filter(r => r.key === 'cur' || r.key.startsWith('t'))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
  const thumbWin = Object.values(results)
    .filter(r => r.key === 'cur' || r.key.startsWith('i'))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
  // An image only counts as rated when the AI actually scored the thumbnail axis.
  const gainT = titleWin && titleWin.key !== 'cur' ? (titleWin.score ?? 0) - (cur.score ?? 0) : 0;
  const gainI = thumbWin && thumbWin.key !== 'cur' && Number.isFinite(thumbWin.axes.thumbnail) ? (thumbWin.score ?? 0) - (cur.score ?? 0) : 0;
  // The owner's own pending title edit wins: the autopilot never competes with it.
  const ownerTitlePending =
    db.prepare("SELECT COUNT(*) AS n FROM staged_edits WHERE video_id = ? AND field = 'title' AND status = 'staged'").get(video.id).n > 0;
  const newTitle = gainT >= s.minGain && !ownerTitlePending ? titleWin.title : null;
  // Suggest a thumbnail only when the current image is saved for comparison.
  const newThumb = gainI >= s.minGain && curThumb ? usableThumbs[Number(thumbWin.key.slice(1)) - 1].path : null;
  const candidates = {
    titles: packages.filter(p => p.key.startsWith('t')).map(p => ({ title: p.title, score: results[p.key].score, axes: results[p.key].axes })),
    thumbnails: usableThumbs.map((t, i) => ({
      path: t.path,
      url: '/data/thumbs/' + path.basename(t.path),
      label: t.label,
      score: results['i' + (i + 1)]?.score,
      thumbnailAxis: results['i' + (i + 1)]?.axes.thumbnail,
    })),
    thumbErrors: thumbs.filter(t => t.error).map(t => t.error),
    current: { score: cur.score, axes: cur.axes },
    thumbText: gen.thumbText,
    notes,
    ownerTitlePending,
  };
  const common = { ...base, before_thumb_path: curThumb, before_score: cur.score, candidates_json: JSON.stringify(candidates) };
  if (!newTitle && !newThumb) {
    const why =
      ownerTitlePending && gainT >= s.minGain
        ? 'You have your own title edit staged for this video, so the autopilot left the title to you.'
        : `No candidate beat the current package by ${s.minGain}+ radar points (best title ${titleWin?.score ?? '—'}, best thumbnail ${thumbWin?.score ?? '—'} vs current ${cur.score ?? '—'}).`;
    return record({ ...common, status: 'skipped', message: why + ' Left unchanged.' });
  }
  const afterScore = Math.max(newTitle ? titleWin.score : 0, newThumb ? thumbWin.score : 0);
  const changed = [newTitle && 'title', newThumb && 'thumbnail'].filter(Boolean).join(',');
  return record({
    ...common,
    after_title: newTitle,
    after_thumb_path: newThumb,
    after_score: afterScore,
    changed,
    status: 'suggested',
    message: 'Suggested. Copy the title or thumbnail and use YouTube Studio.',
  });
}

export function getAction(id) {
  const a = db
    .prepare(
      'SELECT a.*, v.title AS video_title, v.thumbnail AS video_thumbnail FROM autopilot_actions a LEFT JOIN videos v ON v.id = a.video_id WHERE a.id = ?'
    )
    .get(id);
  if (!a) return null;
  return {
    ...a,
    diagnosis: JSON.parse(a.diagnosis_json || 'null'),
    candidates: JSON.parse(a.candidates_json || 'null'),
    diagnosis_json: undefined,
    candidates_json: undefined,
    before_thumb: a.before_thumb_path ? '/data/thumbs/' + path.basename(a.before_thumb_path) : a.before_thumb_url,
    after_thumb: a.after_thumb_path ? '/data/thumbs/' + path.basename(a.after_thumb_path) : null,
  };
}
export function listActions(channelId: string, limit = 50) {
  return db
    .prepare('SELECT id FROM autopilot_actions WHERE channel_id = ? ORDER BY id DESC LIMIT ?')
    .all(channelId, limit)
    .map(r => getAction(r.id));
}

export function addAsset({ videoId, kind = 'thumbnail', path: p, label = '' }: { videoId?: string; kind?: string; path?: string; label?: string }) {
  const v = db.prepare('SELECT channel_id FROM videos WHERE id = ?').get(videoId);
  if (kind === 'thumbnail') p = assertThumbPath(p);
  else if (kind === 'source') {
    p = path.resolve(String(p || ''));
    if (!fs.existsSync(p)) throw Object.assign(new Error('Source video not found on this machine: ' + p), { status: 400 });
  } else throw Object.assign(new Error('kind must be thumbnail or source'), { status: 400 });
  const r = db
    .prepare('INSERT INTO autopilot_assets (channel_id, video_id, kind, path, label) VALUES (?, ?, ?, ?, ?)')
    .run(v?.channel_id || null, videoId, kind, p, label);
  return db.prepare('SELECT * FROM autopilot_assets WHERE id = ?').get(r.lastInsertRowid);
}
export function listAssets(videoId: string) {
  return db
    .prepare('SELECT * FROM autopilot_assets WHERE video_id = ? ORDER BY id')
    .all(videoId)
    .map(a => ({ ...a, url: a.kind === 'thumbnail' ? '/data/thumbs/' + path.basename(a.path) : null }));
}
export function removeAsset(id) {
  return db.prepare('DELETE FROM autopilot_assets WHERE id = ?').run(id).changes;
}
