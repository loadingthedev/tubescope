import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, getSetting, setSetting, allSettings, DATA_DIR } from '../db.ts';
import { quotaToday, quotaHistory, cacheClear, YouTubeError } from '../youtube/client.ts';
import { authUrl, consumeState, exchangeCode, fetchEmail, saveTokens, clearTokens, isAuthorized } from '../youtube/oauth.ts';
import { ytGet } from '../youtube/client.ts';
import * as ch from '../services/channels.ts';
import * as an from '../services/analytics.ts';
import * as disc from '../services/discovery.ts';
import * as pack from '../services/packaging.ts';
import * as com from '../services/comments.ts';
import * as coach from '../services/coach.ts';
import * as comp from '../services/competitors.ts';
import * as misc from '../services/misc.ts';
import * as ai from '../services/ai.ts';
import * as scores from '../services/scores.ts';
import * as stats from '../services/stats.ts';
import * as estimate from '../services/estimate.ts';
import * as exp from '../services/export.ts';
import * as voice from '../services/voice.ts';
import * as thumbs from '../services/thumbs.ts';
import * as ren from '../services/render.ts';
import * as radar from '../services/radar.ts';
import * as notifier from '../services/notify.ts';
import * as reach from '../services/reach.ts';
import * as autopilot from '../services/autopilot.ts';
import * as ideas from '../services/ideas.ts';
import * as slots from '../services/slots.ts';
import * as portfolio from '../services/portfolio.ts';
import * as transcribe from '../services/transcribe.ts';
import { runDailySnapshot } from '../jobs/scheduler.ts';
import { setup } from './setup.ts';
import { readFileSync } from 'node:fs';
const PKG_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
import { growth } from './growth.ts';

export const api = Router();
api.use(setup); // local setup, validated settings and tools/OpenAPI
api.use(growth); // outlier index, formulas, thumbnails, ranks, bulk edits, make-a-video, more platforms, phone
const w = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const SECRET_KEYS = [
  'yt_api_key',
  'google_client_secret',
  'anthropic_api_key',
  'ig_access_token',
  'notify_webhook_url',
  'notify_ntfy_topic',
  'tt_client_secret',
  'tt_access_token',
  'tt_refresh_token',
  'elevenlabs_api_key',
  'heygen_api_key',
  'higgsfield_api_key',
  'higgsfield_api_secret',
];

// ---------- status & settings ----------
api.get(
  '/status',
  w(async (req, res) => {
    const s = allSettings();
    res.json({
      configured: { apiKey: !!s.yt_api_key, oauth: !!(s.google_client_id && s.google_client_secret) },
      ai: await ai.status(),
      quota: quotaToday(),
      channels: ch.listChannels().length,
      lastSnapshot: s.last_snapshot ? JSON.parse(s.last_snapshot) : null,
      version: PKG_VERSION,
      dataDir: DATA_DIR,
    });
  })
);
api.get('/settings', (req, res) => {
  const s = allSettings();
  for (const k of SECRET_KEYS) if (s[k]) s[k] = '••••' + s[k].slice(-4);
  res.json(s);
});
api.put('/settings', (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (SECRET_KEYS.includes(k) && String(v).startsWith('••••')) continue;
    setSetting(k, v);
  }
  res.json({ ok: true });
});
api.post(
  '/settings/test-key',
  w(async (req, res) => {
    const r = await ytGet('videoCategories.list', { part: 'snippet', regionCode: 'US' }, { ttl: 0, noCache: true });
    res.json({ ok: true, categories: r.items?.length || 0 });
  })
);
api.get('/quota', (req, res) => res.json({ today: quotaToday(), history: quotaHistory(14), ai: ai.usage(30) }));
api.post('/cache/clear', (req, res) => res.json({ cleared: cacheClear(req.body?.prefix || '') }));
// Exit cleanly; the macOS LaunchAgent (KeepAlive) or any process manager relaunches with the current code. Local-only like every route.
// Read-only audit export: full catalogue + Analytics for the latest N complete days and the N before, saved under data/exports.
api.get(
  '/export/audit/:id',
  w(async (req, res) => {
    const audit = await exp.channelAudit(req.params.id, { days: Number(req.query.days || 28), retentionLimit: Number(req.query.retention || 60) });
    const file =
      req.query.save === '0'
        ? null
        : exp.saveAudit(audit, req.query.filename || `${(audit.channel.handle || audit.channel.id).replace(/^@/, '')}-tubescope-audit.json`);
    res.json({ file, audit });
  })
);
/** Every registered /api route, read from the router itself, so the guide can never miss one. */
export function routeList() {
  const out = [];
  const walk = (stack, prefix = '') => {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) out.push(`${m.toUpperCase().padEnd(6)} /api${prefix}${l.route.path}`);
      else if (l.handle?.stack) walk(l.handle.stack, prefix);
    }
  };
  walk(api.stack);
  return [...new Set(out)];
}
api.get('/agent', (req, res) =>
  res.type('text/plain').send(
    AGENT_GUIDE +
      `

ALL ROUTES (generated from the server — every one is callable with tubescope_api or plain HTTP on this Mac)
${routeList()
  .map(r => '  ' + r)
  .join('\n')}
`
  )
);
// ---------- media pipeline (ffmpeg): render a JSON timeline, transcode presets, probe, speech segments, caption timing ----------
api.get('/render/status', (req, res) => res.json({ ...ren.toolStatus(), presets: ren.PRESETS, jobs: ren.listJobs(10) }));
api.get('/render/schema', (req, res) => res.json(ren.TIMELINE_SCHEMA));
api.get('/render/jobs', (req, res) => res.json(ren.listJobs(Number(req.query.limit || 50))));
api.get(
  '/render/jobs/:id',
  w(async (req, res) => {
    const j = req.query.wait === '1' ? await ren.waitForJob(req.params.id, Number(req.query.timeout || 1200) * 1000) : ren.getJob(req.params.id);
    j ? res.json(j) : res.status(404).json({ error: 'job not found' });
  })
);
api.post(
  '/render',
  w(async (req, res) => {
    let job;
    try {
      job = ren.render(req.body || {});
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (req.query.wait === '1' || req.body?.wait === true) job = await ren.waitForJob(job.id, Number(req.query.timeout || 1200) * 1000);
    res.status(job.status === 'failed' ? 502 : 200).json(job);
  })
);
api.post(
  '/media/transcode',
  w(async (req, res) => {
    let job;
    try {
      job = ren.transcode(req.body || {});
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (req.query.wait === '1' || req.body?.wait === true) job = await ren.waitForJob(job.id, Number(req.query.timeout || 1200) * 1000);
    res.status(job.status === 'failed' ? 502 : 200).json(job);
  })
);
api.post(
  '/media/probe',
  w(async (req, res) => res.json(await ren.probe(req.body?.file)))
);
api.post(
  '/media/frame',
  w(async (req, res) => res.json(await ren.frame(req.body || {})))
);
api.post(
  '/media/segments',
  w(async (req, res) => res.json(await ren.speechSegments(req.body?.file, { noiseDb: req.body?.noiseDb, minPause: req.body?.minPause })))
);

// ---- Voiceover (ElevenLabs) ----
api.get(
  '/media/voiceover/status',
  w(async (req, res) => res.json(voice.status()))
);
api.get(
  '/media/voiceover/voices',
  w(async (req, res) => res.json(voice.provider(req.query.provider) === 'heygen' ? await voice.heygenVoices() : await voice.listVoices()))
);
api.get(
  '/media/voiceover/quota',
  w(async (req, res) => res.json(voice.provider(req.query.provider) === 'heygen' ? await voice.heygenQuota() : await voice.subscription()))
);
api.get(
  '/media/voiceover',
  w(async (req, res) => res.json(voice.listVoiceovers(Number(req.query.limit || 50))))
);
api.get(
  '/media/voiceover/:id',
  w(async (req, res) => {
    const v = voice.getVoiceover(req.params.id);
    if (!v) return res.status(404).json({ error: 'not found' });
    res.json(v);
  })
);
api.post(
  '/media/voiceover',
  w(async (req, res) => res.json(await voice.speak(req.body || {})))
);
api.post(
  '/media/voiceover/short',
  w(async (req, res) => {
    const out: Awaited<ReturnType<typeof voice.shortFromScript>> & { job?: ReturnType<typeof ren.getJob> } = await voice.shortFromScript(req.body || {});
    if (req.body?.render) {
      const job = ren.render(out.timeline);
      out.job = req.query.wait === '1' ? await ren.waitForJob(job.id) : job;
    }
    res.json(out);
  })
);

// ---- Thumbnail maker ----
api.get(
  '/media/thumbnails/status',
  w(async (req, res) => res.json(thumbs.status()))
);
api.get(
  '/media/thumbnails',
  w(async (req, res) => res.json(thumbs.listSets(Number(req.query.limit || 20))))
);
api.get(
  '/media/thumbnails/:id',
  w(async (req, res) => {
    const s = thumbs.getSet(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(s);
  })
);
api.post(
  '/media/thumbnails',
  w(async (req, res) => res.json(await thumbs.makeSet(req.body || {})))
);
api.post(
  '/media/thumbnails/compose',
  w(async (req, res) => res.json(await thumbs.compose(req.body || {})))
);
api.post(
  '/media/thumbnails/ai',
  w(async (req, res) => res.json(await thumbs.hfImage(req.body || {})))
);
api.get(
  '/media/thumbnails/:id/file/:n',
  w(async (req, res) => {
    const s = thumbs.getSet(req.params.id);
    const c = s?.candidates[Number(req.params.n)];
    if (!c) return res.status(404).end();
    res.sendFile(c.file);
  })
);

api.post(
  '/media/captions',
  w(async (req, res) => {
    const { file, script, srt, maxWords } = req.body || {};
    if (srt) return res.json({ groups: ren.parseSrtGroups(srt) });
    if (!Array.isArray(script)) return res.status(400).json({ error: 'script[] (one line per spoken sentence/pause) and file are required, or srt text.' });
    const segs = await ren.speechSegments(file, { noiseDb: req.body?.noiseDb, minPause: req.body?.minPause });
    const timed = ren.timeScript(script, segs.segments);
    res.json({ segments: segs.segments, lines: timed.lines, words: timed.words, groups: ren.groupWords(timed.words, { maxWords: maxWords || 4 }) });
  })
);

api.post('/system/restart', (req, res) => {
  res.json({ restarting: true });
  setTimeout(() => process.exit(0), 300);
});
api.post(
  '/snapshot/run',
  w(async (req, res) => res.json(await runDailySnapshot({ log: () => {} })))
);

// ---------- OAuth ----------
api.get('/oauth/url', (req, res) => res.json({ url: authUrl() }));

// ---------- channels ----------
api.get('/channels', (req, res) => res.json(ch.listChannels(req.query.kind || null)));
api.post(
  '/channels',
  w(async (req, res) => {
    const c = await ch.addChannel(req.body.input, req.body.kind || 'owned');
    await ch.syncVideos(c.id, { maxVideos: Number(req.body.maxVideos || 200) });
    res.json(ch.getChannel(c.id));
  })
);
api.get('/channels/:id', (req, res) => {
  const c = ch.getChannel(req.params.id);
  c ? res.json(c) : res.status(404).json({ error: 'not found' });
});
api.delete('/channels/:id', (req, res) => res.json({ removed: ch.removeChannel(req.params.id) }));
api.post('/channels/:id/kind', (req, res) => res.json(ch.setKind(req.params.id, req.body.kind)));
api.post('/channels/:id/disconnect', (req, res) => {
  clearTokens(req.params.id);
  res.json(ch.getChannel(req.params.id));
});
api.post(
  '/channels/:id/sync',
  w(async (req, res) => {
    await ch.refreshChannel(req.params.id, { force: true });
    res.json(await ch.syncVideos(req.params.id, { maxVideos: Number(req.body?.maxVideos || 500), force: !!req.body?.force }));
  })
);
api.get('/channels/:id/videos', (req, res) =>
  res.json(ch.listVideos(req.params.id, { ...req.query, limit: Number(req.query.limit || 200), offset: Number(req.query.offset || 0) }))
);
api.get('/channels/:id/history', (req, res) => res.json(ch.channelHistory(req.params.id, Number(req.query.days || 90))));
api.get('/channels/:id/report-card', (req, res) => res.json(comp.reportCard(req.params.id)));
api.get('/channels/:id/forecast', (req, res) => res.json(comp.forecast(req.params.id, { days: Number(req.query.days || 90) })));
api.get('/channels/:id/health', (req, res) => res.json(pack.channelHealth(req.params.id)));
api.get('/channels/:id/segments', (req, res) => res.json(an.performanceSegments(req.params.id)));
api.get('/channels/:id/publish-slots', (req, res) => res.json(an.publishSlots(req.params.id)));
api.get('/channels/:id/backup', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="tubescope-backup-${req.params.id}.json"`);
  res.json(misc.channelBackup(req.params.id));
});
api.get('/channels/:id/export/videos.csv', (req, res) => {
  const { videos } = ch.listVideos(req.params.id, { limit: 5000 });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="videos-${req.params.id}.csv"`);
  res.send(
    misc.toCsv(
      videos.map(v => ({
        id: v.id,
        title: v.title,
        published_at: v.published_at,
        format: v.is_short ? 'short' : 'long',
        duration_sec: v.duration_sec,
        views: v.view_count,
        likes: v.like_count,
        comments: v.comment_count,
        tags: v.tags.join('|'),
        url: 'https://youtu.be/' + v.id,
      }))
    )
  );
});
api.get(
  '/channels/:id/playlists',
  w(async (req, res) => res.json(await misc.listPlaylists(req.params.id, { owned: req.query.owned === '1' })))
);
api.get(
  '/playlists/:pid/items',
  w(async (req, res) => res.json(await misc.playlistItems(req.params.pid, req.query.channelId || null)))
);

// ---------- videos ----------
api.get(
  '/videos/:id',
  w(async (req, res) => {
    let v = ch.getVideo(req.params.id);
    if (!v) {
      const [f] = await ch.fetchVideosByIds([req.params.id]);
      if (!f) return res.status(404).json({ error: 'not found' });
      v = f;
    }
    res.json({ ...v, history: ch.videoHistory(req.params.id, 365), metadataHistory: ch.metadataHistory(req.params.id), format: disc.formatLabel(v.title) });
  })
);
api.get('/videos/:id/checklist', (req, res) => res.json(pack.optimizationChecklist(req.params.id)));
api.get('/videos/:id/age-comparison', (req, res) => {
  const v = ch.getVideo(req.params.id);
  res.json(v ? an.uploadAgeComparison(v.channel_id, req.params.id) : null);
});
api.get(
  '/videos/:id/similar',
  w(async (req, res) => res.json(await disc.similarVideos(req.params.id, { country: req.query.country || getSetting('default_country', 'US') })))
);
api.get(
  '/videos/lookup/:id',
  w(async (req, res) => {
    const [v] = await ch.fetchVideosByIds([req.params.id]);
    res.json(v || null);
  })
);

// ---------- owner analytics ----------
api.get(
  '/analytics/:id/overview',
  w(async (req, res) => res.json(await an.overview(req.params.id, Number(req.query.days || 28))))
);
api.get(
  '/analytics/:id/revenue',
  w(async (req, res) => res.json(await an.revenue(req.params.id, Number(req.query.days || 28))))
);
api.get(
  '/analytics/:id/top',
  w(async (req, res) => res.json(await an.topVideos(req.params.id, Number(req.query.days || 28))))
);
api.get(
  '/analytics/:id/retention/:vid',
  w(async (req, res) => res.json(await an.retention(req.params.id, req.params.vid)))
);
api.get(
  '/analytics/:id/traffic',
  w(async (req, res) => res.json(await an.trafficSources(req.params.id, Number(req.query.days || 28))))
);
api.get(
  '/analytics/:id/geo',
  w(async (req, res) => res.json(await an.geography(req.params.id, Number(req.query.days || 28))))
);
api.get(
  '/analytics/:id/demographics',
  w(async (req, res) => res.json(await an.demographics(req.params.id, Number(req.query.days || 28))))
);
api.get(
  '/analytics/:id/devices',
  w(async (req, res) => res.json(await an.devices(req.params.id, Number(req.query.days || 28))))
);
api.get(
  '/analytics/:id/subscribers',
  w(async (req, res) => res.json(await an.subscribers(req.params.id, Number(req.query.days || 90))))
);
api.get(
  '/analytics/:id/watch-hours',
  w(async (req, res) => res.json(await an.watchHours(req.params.id)))
);
api.get(
  '/analytics/:id/content-types',
  w(async (req, res) => res.json(await an.contentTypeBreakdown(req.params.id, Number(req.query.days || 28))))
);
api.post(
  '/analytics/:id/studio-import',
  w(async (req, res) => res.json(misc.importStudioCsv(req.params.id, req.body.csv, req.body.period || '')))
);
api.get('/analytics/:id/studio', (req, res) => res.json(misc.studioData(req.params.id)));

// ---------- discovery ----------
api.get(
  '/keywords/explore',
  w(async (req, res) =>
    res.json(await disc.keywordExplore(req.query.q, { country: req.query.country || getSetting('default_country', 'US'), deep: req.query.deep !== '0' }))
  )
);
api.get(
  '/keywords/competition',
  w(async (req, res) => res.json(await disc.keywordCompetition(req.query.q, { country: req.query.country || getSetting('default_country', 'US') })))
);
api.get(
  '/keywords/rising',
  w(async (req, res) => res.json(await disc.risingSuggestions(req.query.q, { country: req.query.country || getSetting('default_country', 'US') })))
);
api.get('/keywords/history', (req, res) => res.json(disc.keywordHistory(req.query.q, req.query.country || getSetting('default_country', 'US'))));
api.get('/outliers/local', (req, res) => {
  const ids = String(req.query.channels || '')
    .split(',')
    .filter(Boolean);
  res.json(disc.localOutliers(ids, { format: req.query.format || 'long', minX: Number(req.query.minX || 2), days: Number(req.query.days || 365) }));
});
api.get(
  '/outliers/search',
  w(async (req, res) =>
    res.json(
      await disc.searchOutliers(req.query.q, {
        country: req.query.country || getSetting('default_country', 'US'),
        publishedWithinDays: Number(req.query.days || 90),
        maxSubscribers: req.query.maxSubs ? Number(req.query.maxSubs) : null,
        format: req.query.format || 'all',
        order: req.query.order || 'viewCount',
      })
    )
  )
);
api.get(
  '/trending',
  w(async (req, res) =>
    res.json(await disc.trending({ country: req.query.country || getSetting('default_country', 'US'), categoryId: req.query.category || '' }))
  )
);
api.get(
  '/categories',
  w(async (req, res) => res.json(await disc.categories(req.query.country || getSetting('default_country', 'US'))))
);
api.get(
  '/channels/:id/similar-channels',
  w(async (req, res) =>
    res.json(
      await disc.similarChannels(req.params.id, {
        country: req.query.country || getSetting('default_country', 'US'),
        limit: Number(req.query.limit || 25),
        queries: Number(req.query.queries || 3),
      })
    )
  )
);
api.get(
  '/niche/channels',
  w(async (req, res) => res.json(await disc.nicheChannels(req.query.q, { country: req.query.country || getSetting('default_country', 'US') })))
);
api.post('/titles/patterns', (req, res) => res.json(disc.titlePatterns(req.body.titles || [])));

// ---------- competitors & alerts ----------
api.get('/competitors/:owned', (req, res) => res.json(comp.listCompetitors(req.params.owned)));
api.post(
  '/competitors/:owned',
  w(async (req, res) => res.json(await comp.addCompetitor(req.params.owned, req.body.input, req.body.note || '')))
);
api.delete('/competitors/:owned/:cid', (req, res) => res.json({ removed: comp.removeCompetitor(req.params.owned, req.params.cid) }));
api.get('/competitors/:owned/compare', (req, res) => res.json(comp.compare(req.params.owned, Number(req.query.days || 30))));
api.get('/competitors/:owned/feed', (req, res) => res.json(comp.uploadFeed(req.params.owned, { days: Number(req.query.days || 14) })));
api.post(
  '/competitors/:owned/refresh',
  w(async (req, res) => res.json(await comp.refreshAll(req.params.owned)))
);
api.get('/alerts/:owned', (req, res) => res.json(comp.listAlerts(req.params.owned, { unreadOnly: req.query.unread === '1' })));
api.post('/alerts/:owned/read-all', (req, res) => res.json({ updated: comp.markAllRead(req.params.owned) }));
api.post('/alerts/read/:id', (req, res) => res.json({ updated: comp.markRead(req.params.id) }));

// ---------- packaging ----------
api.post('/packaging/title/analyze', (req, res) => res.json(pack.analyzeTitle(req.body.title, { keyword: req.body.keyword || '' })));
api.post('/packaging/description/analyze', (req, res) => res.json(pack.analyzeDescription(req.body.description, { keyword: req.body.keyword || '' })));
api.post('/packaging/chapters/validate', (req, res) => res.json(pack.validateChapters(req.body.text)));
api.post(
  '/packaging/tags',
  w(async (req, res) => res.json(await pack.suggestTags({ ...req.body, country: req.body.country || getSetting('default_country', 'US') })))
);
api.post(
  '/packaging/titles/generate',
  w(async (req, res) => res.json(await pack.generateTitles(req.body)))
);
api.post(
  '/packaging/description/generate',
  w(async (req, res) => res.json(await pack.generateDescription(req.body)))
);
api.post(
  '/packaging/thumbnail/critique',
  w(async (req, res) => res.json(await pack.critiqueThumbnail(req.body)))
);
api.post(
  '/packaging/translate',
  w(async (req, res) => res.json(await pack.translateMetadata(req.body)))
);
api.post(
  '/packaging/ab-plan',
  w(async (req, res) => res.json(await pack.abTestPlan(req.body)))
);
api.post(
  '/packaging/hook',
  w(async (req, res) => res.json(await pack.hookReview(req.body)))
);
api.get('/packaging/staged/:channel', (req, res) => res.json(pack.listStaged(req.params.channel, req.query.status || 'staged')));
api.post('/packaging/staged', (req, res) => res.json(pack.stageEdit(req.body)));
api.delete('/packaging/staged/:id', (req, res) => res.json({ discarded: pack.discardStaged(req.params.id) }));
api.post(
  '/packaging/thumbnail/upload',
  w(async (req, res) => {
    // body: { dataUrl, name }
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(req.body.dataUrl || '');
    if (!m) return res.status(400).json({ error: 'dataUrl required' });
    const dir = path.join(DATA_DIR, 'thumbs');
    fs.mkdirSync(dir, { recursive: true });
    const ext = m[1] === 'image/png' ? '.png' : '.jpg';
    const file = path.join(dir, `${Date.now()}-${(req.body.name || 'thumb').replace(/[^\w.-]/g, '_')}${ext}`);
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    res.json({ path: file, url: '/data/thumbs/' + path.basename(file) });
  })
);

// ---------- comments ----------
api.get(
  '/comments',
  w(async (req, res) => {
    const threads = await com.fetchThreads({
      videoId: req.query.video || null,
      channelId: req.query.channel || null,
      ownerChannelId: req.query.owner || req.query.channel || null,
      maxPages: Number(req.query.pages || 3),
      order: req.query.order || 'time',
      searchTerms: req.query.search || '',
    });
    const filtered = com.filterThreads(threads, { filter: req.query.filter || 'all', q: req.query.q || '' });
    res.json({
      total: threads.length,
      shown: filtered.length,
      threads: filtered,
      terms: com.termFrequencies(threads.map(t => t.text)),
      questionClusters: com.clusterQuestions(threads),
    });
  })
);
api.post(
  '/comments/ai-clusters',
  w(async (req, res) => res.json(await com.aiClusterQuestions(req.body.threads || [], req.body.channelContext || '')))
);
api.post(
  '/comments/reply-drafts',
  w(async (req, res) => res.json(await com.replyDrafts(req.body.thread, { channelContext: req.body.channelContext || '' })))
);
api.post('/comments/giveaway', (req, res) => res.json(com.pickWinner(req.body.threads || [], req.body)));
api.get('/comments/templates', (req, res) => res.json(com.templates.list()));
api.post('/comments/templates', (req, res) => res.json({ id: com.templates.create(req.body.name, req.body.body) }));
api.put('/comments/templates/:id', (req, res) => res.json({ updated: com.templates.update(req.params.id, req.body.name, req.body.body) }));
api.delete('/comments/templates/:id', (req, res) => res.json({ removed: com.templates.remove(req.params.id) }));

// ---------- AI coach & production ----------
api.get('/coach/:id/context', (req, res) => res.json({ context: coach.channelContext(req.params.id) }));
api.post(
  '/coach/:id/ask',
  w(async (req, res) => res.json(await coach.coach(req.params.id, req.body.question, { mode: req.body.mode || 'quick', extra: req.body.extra || '' })))
);
api.post(
  '/coach/:id/ideas',
  w(async (req, res) => res.json(await coach.dailyIdeas(req.params.id, req.body)))
);
api.post(
  '/coach/idea-generator',
  w(async (req, res) => res.json(await coach.ideaGenerator(req.body)))
);
api.post(
  '/coach/:id/audit',
  w(async (req, res) => res.json(await coach.audit(req.params.id)))
);
api.post(
  '/coach/:id/weekly-plan',
  w(async (req, res) => res.json(await coach.weeklyPlan(req.params.id, req.body)))
);
api.post(
  '/coach/:id/beginner',
  w(async (req, res) => res.json(await coach.beginnerNextSteps(req.params.id)))
);
api.post(
  '/coach/validate-idea',
  w(async (req, res) => res.json(await coach.validateIdea(req.body)))
);
api.get('/coach/lessons', (req, res) => res.json(coach.LESSONS));
api.get(
  '/transcript/:channel/:video',
  w(async (req, res) => res.json(await coach.ownedTranscript(req.params.channel, req.params.video)))
);
api.post('/transcript/parse', (req, res) => res.json({ segments: coach.parseSrt(req.body.srt || ''), text: coach.srtToText(req.body.srt || '') }));
api.post(
  '/production/chapters',
  w(async (req, res) => res.json(await coach.chaptersFromTranscript(req.body)))
);
api.post(
  '/production/clips',
  w(async (req, res) => res.json(await coach.clipMoments(req.body)))
);
api.post(
  '/production/script',
  w(async (req, res) => res.json(await coach.scriptWriter(req.body)))
);
api.post(
  '/production/repurpose',
  w(async (req, res) => res.json(await coach.repurpose(req.body)))
);
api.post(
  '/production/score-script',
  w(async (req, res) => res.json(await coach.scoreScript(req.body)))
);
api.get('/safety-checklist', (req, res) => res.json(misc.SAFETY_CHECKLIST));

// ---------- boards, blueprints, saved, calculators ----------
api.get('/boards/:channel', (req, res) => res.json(misc.boards.list(req.params.channel)));
api.post('/boards/:channel', (req, res) => res.json({ id: misc.boards.create(req.params.channel, req.body.name) }));
api.delete('/boards/id/:id', (req, res) => res.json({ removed: misc.boards.remove(req.params.id) }));
api.get('/boards/id/:id/items', (req, res) => res.json(misc.boards.items(req.params.id)));
api.post('/boards/id/:id/items', (req, res) => res.json({ id: misc.boards.addItem(req.params.id, req.body.kind, req.body.ref, req.body.note || '') }));
api.put('/boards/items/:id', (req, res) => res.json({ updated: misc.boards.updateNote(req.params.id, req.body.note) }));
api.delete('/boards/items/:id', (req, res) => res.json({ removed: misc.boards.removeItem(req.params.id) }));
api.get('/blueprints/:channel', (req, res) => res.json(misc.blueprints.list(req.params.channel)));
api.post('/blueprints/:channel', (req, res) => res.json({ id: misc.blueprints.create(req.params.channel, req.body) }));
api.put('/blueprints/id/:id', (req, res) => res.json({ updated: misc.blueprints.update(req.params.id, req.body) }));
api.delete('/blueprints/id/:id', (req, res) => res.json({ removed: misc.blueprints.remove(req.params.id) }));
api.get('/saved/:channel', (req, res) => res.json(misc.saved.list(req.params.channel, req.query.kind || null)));
api.post('/saved/:channel', (req, res) => res.json({ id: misc.saved.create(req.params.channel, req.body.kind, req.body.title, req.body.body) }));
api.delete('/saved/id/:id', (req, res) => res.json({ removed: misc.saved.remove(req.params.id) }));
api.get('/calc/rpm-bands', (req, res) => res.json(misc.RPM_BANDS));
api.post('/calc/earnings', (req, res) => res.json(misc.earningsScenario(req.body)));
api.post('/calc/valuation', (req, res) => res.json(misc.valuationScenario(req.body)));
api.post('/export/csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${(req.body.name || 'export').replace(/[^\w.-]/g, '_')}.csv"`);
  res.send(misc.toCsv(req.body.rows || [], req.body.columns || null));
});

// ---------- scores & demand index ----------
api.get('/scores/video/:id', (req, res) => {
  const s = scores.videoScore(req.params.id);
  s ? res.json(s) : res.status(404).json({ error: 'not synced' });
});
api.get('/scores/channel/:id', (req, res) => {
  const s = scores.channelScore(req.params.id);
  s ? res.json(s) : res.status(404).json({ error: 'not found' });
});
api.get('/scores/channel/:id/videos', (req, res) => res.json(scores.videoScoresForChannel(req.params.id)));
api.get(
  '/keywords/demand',
  w(async (req, res) => res.json(await scores.demandIndex(req.query.q, { country: req.query.country || getSetting('default_country', 'US') })))
);

// ---------- virality radar: pre-publish score, calibration against your own history, live breakout watch ----------
api.get('/radar/axes', (req, res) => res.json(radar.axesInfo()));
api.post(
  '/radar/score',
  w(async (req, res) => res.json(await radar.scoreIdea(req.body || {})))
);
api.get('/radar/video/:id', (req, res) => {
  const r = radar.scoreExisting(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'video not synced' });
});
api.get('/radar/model/:channel', (req, res) => res.json({ current: radar.currentModel(req.params.channel), history: radar.listModels(req.params.channel) }));
api.post(
  '/radar/calibrate/:channel',
  w(async (req, res) => {
    if (!ch.getChannel(req.params.channel)) return res.status(404).json({ error: 'unknown channel' });
    const b = req.body || {};
    let job = radar.startCalibration(req.params.channel, {
      useAI: b.ai !== false,
      ...(b.aiLimit !== undefined ? { aiLimit: Number(b.aiLimit) } : {}),
      ...(b.minAgeDays !== undefined ? { minAgeDays: Number(b.minAgeDays) } : {}),
    });
    if (req.query.wait === '1' || b.wait === true) job = await radar.waitJob(job.id, Number(req.query.timeout || 1800) * 1000);
    else job = radar.getJob(job.id);
    res.status(job.status === 'failed' ? 400 : 200).json(job);
  })
);
api.get(
  '/radar/jobs/:id',
  w(async (req, res) => {
    const j = req.query.wait === '1' ? await radar.waitJob(req.params.id, Number(req.query.timeout || 600) * 1000) : radar.getJob(req.params.id);
    j ? res.json(j) : res.status(404).json({ error: 'job not found (jobs live in memory until restart; models persist)' });
  })
);
api.get('/radar/watch/:channel', (req, res) => res.json(radar.watchBoard(req.params.channel, { includeInactive: req.query.all !== '0' })));
api.post(
  '/radar/watch/run',
  w(async (req, res) => res.json(await radar.watchTick()))
);
api.get('/radar/curve/:video', (req, res) => {
  const c = radar.watchCurve(req.params.video);
  c ? res.json(c) : res.status(404).json({ error: 'video is not on the radar watch' });
});
api.get('/radar/history/:channel', (req, res) => res.json(radar.history(req.params.channel, { limit: Number(req.query.limit || 100) })));
api.post('/radar/scores/:id/link', (req, res) => res.json({ updated: radar.linkScore(req.params.id, req.body?.videoId || null) }));

// ---------- phone alerts ----------
api.get('/notify/config', (req, res) => {
  const c = notifier.config();
  res.json({
    ...c,
    ntfyTopic: c.ntfyTopic ? '••••' + c.ntfyTopic.slice(-4) : '',
    webhookUrl: c.webhookUrl ? '••••' + c.webhookUrl.slice(-6) : '',
    channels: notifier.channelsConfigured(c),
    defaultKinds: notifier.DEFAULT_KINDS,
    quietNow: notifier.inQuietHours(),
  });
});
api.post(
  '/notify/test',
  w(async (req, res) => res.json(await notifier.test()))
);
api.get('/notify/log', (req, res) => res.json(notifier.log(Number(req.query.limit || 50))));

// ---------- impressions + CTR (YouTube Reporting API reach reports) ----------
api.get('/reach/:channel', (req, res) => res.json(reach.channelSummary(req.params.channel, { days: Number(req.query.days || 28) })));
api.post(
  '/reach/:channel/sync',
  w(async (req, res) => res.json(await reach.syncChannel(req.params.channel)))
);
api.get('/reach/video/:id', (req, res) => res.json(reach.videoReach(req.params.id) || { impressions: null, ctr: null }));

// ---------- radar autopilot ----------
api.get('/autopilot/:channel', (req, res) =>
  res.json({ settings: autopilot.settings(), actions: autopilot.listActions(req.params.channel, Number(req.query.limit || 50)) })
);
api.get('/autopilot/diagnose/:video', (req, res) => {
  const v = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.video);
  v
    ? res.json(autopilot.diagnose(v, { paceIndex: db.prepare('SELECT idx FROM radar_watch WHERE video_id = ?').get(v.id)?.idx ?? null }))
    : res.status(404).json({ error: 'video not synced' });
});
api.post(
  '/autopilot/run/:video',
  w(async (req, res) =>
    res.json(
      await autopilot.runForVideo(req.params.video, {
        force: req.body?.force !== false,
        paceIndex: db.prepare('SELECT idx FROM radar_watch WHERE video_id = ?').get(req.params.video)?.idx ?? null,
      })
    )
  )
);
api.get('/autopilot/assets/:video', (req, res) => res.json(autopilot.listAssets(req.params.video)));
api.post('/autopilot/assets', (req, res) => {
  try {
    res.json(autopilot.addAsset(req.body || {}));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});
api.delete('/autopilot/assets/:id', (req, res) => res.json({ removed: autopilot.removeAsset(Number(req.params.id)) }));

// ---------- daily idea list ----------
api.get('/ideas/:channel', (req, res) => res.json(ideas.list(req.params.channel, { days: Number(req.query.days || 14), status: req.query.status || null })));
api.post(
  '/ideas/:channel/run',
  w(async (req, res) =>
    res.json(
      await ideas.runDaily(req.params.channel, { count: Number(req.body?.count || getSetting('ideas_count', 8)), notifyPhone: req.body?.notify !== false })
    )
  )
);
api.post('/ideas/item/:id/status', (req, res) => {
  try {
    res.json({ updated: ideas.setStatus(Number(req.params.id), req.body?.status) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- best slots and transcripts ----------
api.get('/slots/:channel', (req, res) =>
  res.json({
    next: slots.bestSlots(req.params.channel, { format: req.query.format || null, count: Number(req.query.count || 5) }),
    grid: slots.slotGrid(req.params.channel, { format: req.query.format || null }),
  })
);
api.get('/transcripts/:video', (req, res) => {
  const t = transcribe.cached(req.params.video);
  t ? res.json(t) : res.status(404).json({ error: 'no transcript yet' });
});
api.post(
  '/transcripts/:video',
  w(async (req, res) => {
    const t = await transcribe.transcriptFor(req.params.video, { allowCaptions: req.body?.captions === true });
    t ? res.json(t) : res.status(404).json({ error: 'No source file and captions not allowed/available.' });
  })
);

// ---------- all channels ----------
api.get(
  '/portfolio',
  w(async (req, res) => res.json(await portfolio.overview()))
);
api.post(
  '/portfolio/weekly-summary',
  w(async (req, res) => res.json(await portfolio.weeklySummary({ send: req.body?.send !== false })))
);

// ---------- Instagram reels ----------
async function recentUploads(c, excludeId = null) {
  if (!c?.uploads_playlist) return [];
  const page = await ytGet('playlistItems.list', { part: 'contentDetails', playlistId: c.uploads_playlist, maxResults: 50 }, { ttl: 6 * 3600 });
  const ids = (page.items || [])
    .map(i => i.contentDetails.videoId)
    .filter(id => id !== excludeId)
    .slice(0, 50);
  return ids.length ? ch.fetchVideosByIds(ids) : [];
}
function channelSummary(c, uploads) {
  const now = Date.now();
  const long = uploads.filter(v => !v.is_short),
    shorts = uploads.filter(v => v.is_short);
  const span =
    uploads.length > 1
      ? Math.max(7, (new Date(uploads[0].published_at).getTime() - new Date(uploads[uploads.length - 1].published_at).getTime()) / 86400000)
      : 30;
  const medLong = stats.median(long.map(v => v.view_count)) || 0,
    medShort = stats.median(shorts.map(v => v.view_count)) || 0;
  const recent = uploads.map(v => {
    const age = Math.max(1, (now - new Date(v.published_at).getTime()) / 86400000);
    const med = v.is_short ? medShort : medLong;
    return {
      id: v.id,
      title: v.title,
      thumbnail: v.thumbnail,
      view_count: v.view_count,
      published_at: v.published_at,
      is_short: v.is_short,
      ageDays: Math.round(age),
      vpd: v.view_count / age,
      outlierX: med ? v.view_count / med : null,
      est: estimate.estVideoRevenue(v),
    };
  });
  return {
    uploadsPerWeek: Math.round((uploads.length / span) * 7 * 10) / 10,
    medianLongViews: medLong,
    medianShortViews: medShort,
    avgViewsPerVideo: c.video_count ? Math.round(c.view_count / c.video_count) : null,
    viewsPerSub: c.subscriber_count ? c.view_count / c.subscriber_count : null,
    ageDays: c.published_at ? Math.round((now - new Date(c.published_at).getTime()) / 86400000) : null,
    monthly: estimate.estChannelMonthly(c, uploads),
    recent: recent.slice(0, 12),
    breakouts: recent.filter(r => r.outlierX >= 3).slice(0, 5),
  };
}
api.get(
  '/ext/video/:id',
  w(async (req, res) => {
    const [v] = await ch.fetchVideosByIds([req.params.id]);
    if (!v) return res.status(404).json({ error: 'video not found' });
    const [c] = await ch.fetchChannelsByIds([v.channel_id]);
    const peers = await recentUploads(c, v.id);
    let baseline = null;
    if (peers.length) {
      const same = peers.filter(p => !!p.is_short === !!v.is_short);
      baseline = {
        sample: same.length,
        medianViews: stats.median(same.map(p => p.view_count)) || 0,
        medianVpd: stats.median(same.map(p => p.view_count / Math.max(1, (Date.now() - new Date(p.published_at).getTime()) / 86400000))) || 0,
      };
    }
    const ageMs = Date.now() - new Date(v.published_at).getTime(),
      age = Math.max(1, ageMs / 86400000);
    const owned = ch.listChannels('owned').map(x => x.id);
    const tracked = db.prepare('SELECT 1 FROM channels WHERE id = ?').get(v.channel_id);
    const titleA = pack.analyzeTitle(v.title),
      descA = pack.analyzeDescription(v.description || '', { keyword: v.title.split(/[|:\-–(]/)[0].trim() });
    res.json({
      video: v,
      channel: c || null,
      ageDays: Math.round(age),
      ageHours: Math.max(1, Math.round(ageMs / 3600000)),
      vpd: v.view_count / age,
      vph: v.view_count / Math.max(1, ageMs / 3600000),
      outlierX: baseline?.medianViews ? v.view_count / baseline.medianViews : null,
      velocityX: baseline?.medianVpd ? v.view_count / age / baseline.medianVpd : null,
      baseline,
      subsRatio: c?.subscriber_count ? v.view_count / c.subscriber_count : null,
      engagement: v.view_count ? (v.like_count + v.comment_count) / v.view_count : 0,
      likeRate: v.view_count ? v.like_count / v.view_count : 0,
      commentRate: v.view_count ? v.comment_count / v.view_count : 0,
      est: estimate.estVideoRevenue(v),
      channelSummary: c
        ? channelSummary(
            c,
            peers.concat([v]).sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
          )
        : null,
      titleScore: titleA.score,
      descScore: descA.score,
      seoScore: Math.round(titleA.score * 0.5 + descA.score * 0.3 + Math.min(100, (v.tags?.length || 0) * 8) * 0.2),
      format: disc.formatLabel(v.title),
      isOwned: owned.includes(v.channel_id),
      isTracked: !!tracked,
      ownedChannels: ch.listChannels('owned').map(x => ({ id: x.id, title: x.title })),
    });
  })
);
// Channel page: public stats, est. monthly revenue, upload cadence, recent uploads with outlier multipliers.
// YouTube Studio overlay: live scoring of the title/description/tags the user is typing on the video edit page.
api.post(
  '/ext/studio',
  w(async (req, res) => {
    const { videoId = null, title = '', description = '', tags = [], keyword: kw = '' } = req.body || {};
    const t = String(title || '').trim();
    if (!t) return res.status(400).json({ error: 'title required' });
    const keyword = String(kw || '').trim() || pack.titleSeed(t);
    const owned = ch.listChannels('owned');
    const known = videoId ? db.prepare('SELECT channel_id, view_count, published_at, is_short FROM videos WHERE id = ?').get(videoId) : null;
    const channelId = known?.channel_id || owned[0]?.id || null;
    const titleA = pack.analyzeTitle(t, { keyword }),
      descA = pack.analyzeDescription(description, { keyword });
    const tagList = (Array.isArray(tags) ? tags : String(tags).split(',')).map(x => String(x).trim()).filter(Boolean);
    const tagChars = tagList.join(',').length;
    const tagChecks = [
      { name: '8–20 tags', pass: tagList.length >= 8 && tagList.length <= 20, detail: `${tagList.length} tags` },
      { name: 'Title keyword is a tag', pass: tagList.some(x => x.toLowerCase() === keyword.toLowerCase()), detail: keyword },
      { name: 'Under 500 characters total', pass: tagChars <= 500, detail: `${tagChars} chars` },
      {
        name: 'Has 2+ multi-word (long-tail) tags',
        pass: tagList.filter(x => x.includes(' ')).length >= 2,
        detail: `${tagList.filter(x => x.includes(' ')).length} long-tail`,
      },
    ];
    const tagScore = Math.round((100 * tagChecks.filter(c => c.pass).length) / tagChecks.length);
    let radarRes = null,
      demand = null;
    try {
      radarRes = await radar.scoreIdea({ channelId, variants: [{ title: t }], keyword, format: known?.is_short ? 'short' : 'long', ai: false, save: false });
    } catch (e) {
      radarRes = { error: e.message };
    }
    try {
      demand = await scores.demandIndex(keyword, { country: getSetting('default_country', 'US') });
    } catch (e) {
      demand = { error: e.message };
    }
    const r = radarRes?.variants?.[0] || null;
    res.json({
      videoId,
      channelId,
      keyword,
      isOwned: !!known,
      title: titleA,
      description: descA,
      tags: { score: tagScore, checks: tagChecks, list: tagList },
      seoScore: Math.round(titleA.score * 0.5 + descA.score * 0.3 + tagScore * 0.2),
      radar: r ? { score: r.score, axes: r.axes, prediction: r.prediction, advice: r.advice || [], notes: radarRes.notes || [] } : radarRes,
      demand: demand?.error ? demand : { index: demand.demandIndex, band: demand.band, components: demand.components, note: demand.note },
      suggestedTags:
        (await pack.suggestTags({ title: t, description, keyword, country: getSetting('default_country', 'US') }).catch(() => ({ tags: [] })))?.tags?.slice(
          0,
          15
        ) || [],
    });
  })
);
api.get(
  '/ext/channel',
  w(async (req, res) => {
    const ref = String(req.query.ref || '').trim();
    if (!ref) return res.status(400).json({ error: 'ref required' });
    const item = await ch.resolveChannel(ref);
    const c = ch.channelFromResource(item);
    const uploads = await recentUploads(c);
    const owned = ch.listChannels('owned').map(x => x.id);
    const tracked = db.prepare('SELECT 1 FROM channels WHERE id = ?').get(c.id);
    res.json({ channel: c, summary: channelSummary(c, uploads), isOwned: owned.includes(c.id), isTracked: !!tracked });
  })
);
// Batch chips for thumbnails on home/search/related/channel grids: 1 unit per 50 videos (+1 per 50 channels), cached.
api.get(
  '/ext/videos',
  w(async (req, res) => {
    const ids = [
      ...new Set(
        String(req.query.ids || '')
          .split(',')
          .map(s => s.trim())
          .filter(s => /^[\w-]{11}$/.test(s))
      ),
    ].slice(0, 50);
    if (!ids.length) return res.json({ videos: {} });
    const vids = await ch.fetchVideosByIds(ids);
    const chans = await ch.fetchChannelsByIds([...new Set(vids.map(v => v.channel_id))]);
    const byCh = Object.fromEntries(chans.map(c => [c.id, c]));
    const now = Date.now(),
      out = {};
    for (const v of vids) {
      const ageMs = now - new Date(v.published_at).getTime(),
        age = Math.max(1, ageMs / 86400000),
        c = byCh[v.channel_id];
      const avg = c?.video_count ? c.view_count / c.video_count : null;
      out[v.id] = {
        views: v.view_count,
        likes: v.like_count,
        comments: v.comment_count,
        ageDays: Math.round(age),
        vpd: v.view_count / age,
        vph: v.view_count / Math.max(1, ageMs / 3600000),
        is_short: v.is_short,
        duration_sec: v.duration_sec,
        subs: c?.subscriber_count ?? null,
        vsChannelAvg: avg ? v.view_count / avg : null,
        est: estimate.estVideoRevenue(v),
      };
    }
    res.json({ videos: out });
  })
);
// Search page: demand index + cached competition if we already have it (never spends 100 units from the extension).
api.get(
  '/ext/keyword',
  w(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json(null);
    const country = req.query.country || getSetting('default_country', 'US');
    const demand = await scores.demandIndex(q, { country });
    const hist = disc.keywordHistory(q, country);
    res.json({ demand, competition: hist.length ? hist[hist.length - 1] : null, openUrl: `/#/keywords?q=${encodeURIComponent(q)}&mode=compete` });
  })
);
api.get(
  '/ext/summary',
  w(async (req, res) => {
    const owned = ch.listChannels('owned');
    const out = [];
    for (const c of owned) {
      const hist = ch.channelHistory(c.id, 2);
      const latest = db.prepare('SELECT id, title, view_count, published_at FROM videos WHERE channel_id = ? ORDER BY published_at DESC LIMIT 1').get(c.id);
      const unread = db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE channel_id = ? AND read = 0').get(c.id).n;
      out.push({
        id: c.id,
        title: c.title,
        thumbnail: c.thumbnail,
        subs: c.subscriber_count,
        views: c.view_count,
        subsDelta: hist.length > 1 ? hist[hist.length - 1].subs - hist[0].subs : null,
        latest,
        unreadAlerts: unread,
        score: scores.channelScore(c.id)?.score ?? null,
      });
    }
    res.json({ channels: out, quota: quotaToday() });
  })
);
api.post(
  '/ext/track',
  w(async (req, res) => {
    const owned = req.body.ownedId || ch.listChannels('owned')[0]?.id;
    if (!owned) return res.status(400).json({ error: 'Add an owned channel in Tubescope first' });
    res.json(await comp.addCompetitor(owned, req.body.channelId));
  })
);
api.post(
  '/ext/save',
  w(async (req, res) => {
    const owned = req.body.ownedId || ch.listChannels('owned')[0]?.id;
    if (!owned) return res.status(400).json({ error: 'Add an owned channel in Tubescope first' });
    let boards = misc.boards.list(owned);
    if (!boards.length) {
      misc.boards.create(owned, 'Inspiration');
      boards = misc.boards.list(owned);
    }
    const id = misc.boards.addItem(boards[0].id, 'video', req.body.ref, req.body.note || 'saved from YouTube');
    res.json({ id, board: boards[0].name });
  })
);

// ---------- error handler ----------
api.use((err, req, res, next) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[api]', req.method, req.path, err);
  res.status(status).json({ error: err.message, reason: err.reason || err.name, endpoint: err.endpoint });
});

// OAuth callback lives outside /api
export function oauthCallback() {
  const r = Router();
  r.get(
    '/oauth/callback',
    w(async (req, res) => {
      const { code, state, error } = req.query;
      if (error) return res.status(400).send(`Google returned an error: ${error}`);
      if (!consumeState(state)) return res.status(400).send('OAuth state mismatch or expired; start again from Channels.');
      const tokens = await exchangeCode(code);
      const email = await fetchEmail(tokens.access_token);
      // Discover the channel(s) this Google account owns and attach the tokens to each.
      const res2 = await fetch(
        (process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3') +
          '/channels?part=snippet,statistics,contentDetails,brandingSettings&mine=true&maxResults=50',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const j = await res2.json();
      if (!res2.ok) return res.status(500).send(`Could not list channels: ${j?.error?.message}`);
      const ids = [];
      for (const item of j.items || []) {
        ch.upsertChannel(ch.channelFromResource(item), 'owned');
        saveTokens(item.id, tokens);
        db.prepare('UPDATE channels SET oauth_email = ? WHERE id = ?').run(email, item.id);
        ids.push(item.id);
        ch.syncVideos(item.id, { maxVideos: 500 }).catch(e => console.error('[sync]', e.message));
      }
      res.redirect(`/#/channels?connected=${ids.join(',')}`);
    })
  );
  return r;
}

export { YouTubeError };

const AGENT_GUIDE = 'Tubescope is a read-only YouTube research desk. Use analysis, suggestions and local drafts. Publish changes by hand in YouTube Studio.';
