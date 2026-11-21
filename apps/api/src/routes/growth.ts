// Routes for the v2.1 research and workflow features: outlier index, niches, title formulas, similar thumbnails,
// rank tracking, competitor audience, bulk draft previews, source files and local video generation.
import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.ts';
import * as research from '../services/research.ts';
import * as wf from '../services/workflow.ts';

export const growth = Router();
const w = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

// ---------- research ----------
growth.get('/index', (req, res) => res.json(research.searchIndex({ q: req.query.q || '', minX: num(req.query.minX, 3), format: req.query.format || 'all', days: num(req.query.days, 365), maxSubs: req.query.maxSubs ? Number(req.query.maxSubs) : null, limit: num(req.query.limit, 50), sort: req.query.sort || 'x' })));
growth.get('/index/stats', (req, res) => res.json({ ...research.indexStats(), queries: db.prepare('SELECT query, source, last_run, runs, last_results FROM index_queries ORDER BY last_run IS NULL DESC, last_run DESC LIMIT 200').all() }));
growth.post('/index/crawl', w(async (req, res) => {
  const p = research.crawl({ budget: req.body?.budget ? Number(req.body.budget) : undefined, log: console.log });
  if (req.query.wait === '1') return res.json(await p);
  p.catch(e => console.error('[index]', e.message)); res.json({ started: true });
}));
growth.post('/index/queries', w(async (req, res) => {
  const qy = String(req.body?.query || '').trim().toLowerCase();
  if (qy.length < 3) return res.status(400).json({ error: 'query is too short' });
  db.prepare('INSERT OR IGNORE INTO index_queries (query, source) VALUES (?, ?)').run(qy, 'added');
  res.json(req.body?.now ? await research.indexQuery(qy) : { added: qy, note: 'Indexed on the next daily crawl (or pass now: true — 102 quota units).' });
}));
growth.get('/niches', (req, res) => res.json({ niches: research.niches({ q: req.query.q || '', maxSubs: num(req.query.maxSubs, 100000), minVideos: num(req.query.minVideos, 2), limit: num(req.query.limit, 30) }), indexed: research.indexStats().videos }));
growth.get('/formulas', (req, res) => res.json(research.titleFormulas({ q: req.query.q || '', minX: num(req.query.minX, 3), format: req.query.format || 'all', limit: num(req.query.limit, 25) })));
growth.get('/thumbnails/similar', w(async (req, res) => res.json(await research.similarThumbnails({ videoId: req.query.videoId, limit: num(req.query.limit, 24), minScore: num(req.query.minScore, 0.55) }))));
growth.post('/thumbnails/similar', w(async (req, res) => res.json(await research.similarThumbnails({ videoId: req.body?.videoId || null, file: req.body?.file || null, limit: num(req.body?.limit, 24), minScore: num(req.body?.minScore, 0.55) }))));
growth.get('/ranks', (req, res) => res.json({ keywords: research.listRanks(req.query.channelId || null) }));
growth.post('/ranks', w(async (req, res) => {
  const out = research.addRankKeyword(req.body?.channelId, req.body?.keyword, req.body?.country);
  if (req.body?.check !== false) { const k = db.prepare('SELECT * FROM rank_keywords WHERE channel_id = ? AND keyword = ?').get(req.body.channelId, String(req.body.keyword).trim().toLowerCase()); if (k) await research.checkRank(k).catch(() => {}); }
  res.json({ keywords: research.listRanks(req.body.channelId) || out });
}));
growth.delete('/ranks/:id', (req, res) => res.json({ removed: research.removeRankKeyword(Number(req.params.id)) }));
growth.post('/ranks/check', w(async (req, res) => res.json({ results: await research.checkAllRanks() })));
growth.get('/competitor-audience/:channelId', w(async (req, res) => res.json(await research.competitorAudience(req.params.channelId))));

// ---------- bulk edits ----------
growth.post('/bulk/preview', (req, res) => res.json(wf.bulkPreview(req.body || {})));
growth.get('/bulk', (req, res) => res.json({ batches: wf.bulkBatches(req.query.channelId, num(req.query.limit, 20)) }));

// ---------- source files on this Mac ----------
growth.post('/sources/match', w(async (req, res) => res.json(await wf.matchSources(req.body?.channelId || null, { rescan: req.body?.rescan !== false }))));
growth.get('/sources/media', (req, res) => res.json({ folders: wf.mediaDirs(), files: db.prepare('SELECT path, duration, width, height FROM media_files ORDER BY mtime DESC LIMIT 500').all() }));

// ---------- make a video (long-running: returns a job id; wait=1 blocks) ----------
const makeJobs = new Map();
growth.post('/make-video', w(async (req, res) => {
  const id = crypto.randomBytes(5).toString('hex');
  const job: { id: string; status: string; log: string[]; started: string; promise?: Promise<unknown>; statusCode?: number; error?: string; result?: unknown } = { id, status: 'running', log: [], started: new Date().toISOString() };
  makeJobs.set(id, job);
  job.promise = wf.makeVideo({ ...(req.body || {}), log: l => job.log.push(l) })
    .then(r => Object.assign(job, { status: 'done', result: r }))
    .catch(e => Object.assign(job, { status: 'failed', error: e.message, statusCode: e.status }));
  if (req.query.wait === '1') { await job.promise; if (job.status === 'failed') return res.status(job.statusCode || 500).json({ error: job.error, log: job.log }); }
  const { promise, ...out } = job; res.json(out);
}));
growth.get('/make-video/:id', w(async (req, res) => {
  const job = makeJobs.get(req.params.id); if (!job) return res.status(404).json({ error: 'no such job (jobs live until Tubescope restarts)' });
  if (req.query.wait === '1') await Promise.race([job.promise, new Promise(r => setTimeout(r, 25 * 60e3))]);
  const { promise, ...out } = job; res.json(out);
}));
