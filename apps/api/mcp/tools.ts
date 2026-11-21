// Tool registry shared by local stdio MCP and HTTP tools. No dependencies.
export const VERSION = '2.1.0';

/** The user's brands as plain text for the server instructions, so every AI knows them without asking. */
export function brandsText(b) {
  return b?.brands?.length ? '\n\nChannels: ' + b.brands.map(x => x.title + ' (' + x.channelId + ')').join(', ') : '\n\nNo channels are set up yet: run setup_status.';
}

export const INSTRUCTIONS = base => `Tubescope (${base}) is a read-only YouTube research desk. Use research, radar, analytics, suggestions and local drafts. Copy drafts and publish manually in YouTube Studio. Start with setup_status and list_channels. tubescope_api reaches the local API.`;

const q = o => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== '') u.set(k, String(v)); const s = u.toString(); return s ? '?' + s : ''; };

export const TOOLS = [
  { name: 'render_video', description: 'Render an MP4 from a JSON timeline with ffmpeg: video/image/box/text/captions/audio/tone tracks, zoom, auto-timed captions from a script, ducked music, loudness normalization. Returns the job with the output path when wait=true (default). Call tubescope_api GET /api/render/schema for the full track reference.',
    inputSchema: { type: 'object', required: ['tracks'], properties: { width: { type: 'integer', default: 1080 }, height: { type: 'integer', default: 1920 }, fps: { type: 'integer', default: 30 }, background: { type: 'string' }, duration: { type: 'number' }, loudness: { type: 'number', default: -14 }, output: { type: 'string', description: 'absolute output path (.mp4)' }, tracks: { type: 'array', items: { type: 'object' } }, wait: { type: 'boolean', default: true } } } },
  { name: 'media_transcode', description: 'Transcode a video to a platform preset (short/reel 1080x1920, youtube 1920x1080, square, contain) with H.264/AAC and loudness normalization.',
    inputSchema: { type: 'object', required: ['file'], properties: { file: { type: 'string' }, preset: { type: 'string', enum: ['short', 'reel', 'youtube', 'square', 'contain'], default: 'short' }, output: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, fit: { type: 'string', enum: ['cover', 'contain'] }, trim: { type: 'object', properties: { start: { type: 'number' }, duration: { type: 'number' } } }, wait: { type: 'boolean', default: true } } } },
  { name: 'media_probe', description: 'Duration, resolution, fps, codecs, size of a media file.', inputSchema: { type: 'object', required: ['file'], properties: { file: { type: 'string' } } } },
  { name: 'speech_segments', description: 'Speech segments (start/end) of a voice track via pause detection — use to place cuts and B-roll on sentence boundaries.', inputSchema: { type: 'object', required: ['file'], properties: { file: { type: 'string' }, noiseDb: { type: 'number', default: -35 }, minPause: { type: 'number', default: 0.22 } } } },
  { name: 'caption_timing', description: 'Time a script (one line per spoken sentence/pause) against the voice track → word timings and 3–4-word caption groups ready for a captions track.', inputSchema: { type: 'object', required: ['file', 'script'], properties: { file: { type: 'string' }, script: { type: 'array', items: { type: 'string' } }, maxWords: { type: 'integer', default: 4 } } } },
  { name: 'extract_frame', description: 'Save a JPG frame from a video at a timestamp (for QA or a cover image).', inputSchema: { type: 'object', required: ['file'], properties: { file: { type: 'string' }, at: { type: 'number', default: 1 }, output: { type: 'string' }, width: { type: 'integer' } } } },
  { name: 'render_job', description: 'Get a render/transcode job by id; wait=true blocks until it finishes.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, wait: { type: 'boolean', default: false } } } },
  { name: 'voiceover', description: 'Generate a voiceover from text with the user\'s HeyGen cloned voice (default) or ElevenLabs (keys in Tubescope settings). Returns the MP3 path, duration, per-word timings and caption groups ready for a render_video captions track ({type:"captions", groups}).', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, provider: { type: 'string', enum: ['heygen', 'elevenlabs'] }, voiceId: { type: 'string' }, model: { type: 'string' }, speed: { type: 'number', default: 1 }, maxWords: { type: 'integer', default: 4 } } } },
  { name: 'voiceover_short', description: 'Script → voiceover → ready 9:16 timeline (background clip/image, ducked voice, word captions, optional headline). render=true also renders the MP4 and returns its path.', inputSchema: { type: 'object', required: ['text', 'background'], properties: { text: { type: 'string' }, background: { type: 'string', description: 'absolute path to a video or image' }, headline: { type: 'string' }, music: { type: 'string' }, provider: { type: 'string', enum: ['heygen', 'elevenlabs'] }, voiceId: { type: 'string' }, render: { type: 'boolean', default: true } } } },
  { name: 'voiceover_voices', description: 'List voices on the configured provider (HeyGen clones first, or ElevenLabs), plus remaining quota.', inputSchema: { type: 'object', properties: { provider: { type: 'string', enum: ['heygen', 'elevenlabs'] } } } },
  { name: 'make_thumbnails', description: 'Thumbnail maker: frames from a video (or given images / an optional Higgsfield AI background) × headlines × styles → 1280×720 candidates ranked 0–100 by the thumbnail critic. Use the best file manually in YouTube Studio.', inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'absolute path to the video' }, title: { type: 'string' }, headlines: { type: 'array', items: { type: 'string' }, description: 'up to 3; use "|" to force a line break' }, styles: { type: 'array', items: { type: 'string', enum: ['bold', 'clean', 'alert', 'contrast'] } }, frames: { type: 'integer', default: 3 }, backgrounds: { type: 'array', items: { type: 'string' } }, aiPrompt: { type: 'string', description: 'optional Higgsfield text→image background (needs API key+secret in settings; costs credits)' }, score: { type: 'boolean', default: true }, max: { type: 'integer', default: 12 } } } },
  { name: 'similar_channels', description: 'Channels similar to one of yours: ranks channels that keep appearing for your best-performing title terms, scored by overlap × size fit. Marks ones already tracked as competitors.', inputSchema: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string' }, limit: { type: 'integer', default: 25 }, country: { type: 'string' } } } },
  { name: 'list_channels', description: 'Owned and competitor channels tracked in Tubescope (owned ones show whether they are authorized for uploads).', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['owned', 'competitor'] } } } },
  { name: 'channel_videos', description: 'Local catalogue of a channel: views, views/day, outlier × vs the channel median, format.', inputSchema: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string' }, limit: { type: 'integer', default: 50 }, sort: { type: 'string' } } } },
  { name: 'keyword_research', description: 'Autocomplete tree, competition evidence and demand index (0–100, not search volume) for a query.', inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' }, country: { type: 'string', default: 'US' } } } },
  { name: 'outliers', description: 'Videos performing far above their own channel median for a topic (search.list, 100 units per uncached query).', inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' }, days: { type: 'integer', default: 90 }, maxSubs: { type: 'integer' }, format: { type: 'string', enum: ['all', 'long', 'short'] } } } },
  { name: 'radar_score', description: 'Virality radar: score 1–8 title/thumbnail variants (plus optional opening hook) for a video idea BEFORE publishing. Returns each variant ranked with 8 axes (demand, proven-pattern fit, freshness, title craft, curiosity, emotion, thumbnail, hook), a 0–100 score, the predicted multiplier vs the channel\'s usual views with an 80% range, P(breakout ≥2×) and concrete fixes. Calibrated to the channel once radar_calibrate has run.',
    inputSchema: { type: 'object', required: ['variants'], properties: {
      channelId: { type: 'string', description: 'Owned channel id (defaults to the first owned channel)' },
      variants: { type: 'array', items: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, thumbnailUrl: { type: 'string' }, thumbnailPath: { type: 'string', description: 'Image inside Tubescope data/thumbs (POST /api/packaging/thumbnail/upload)' } } } },
      hook: { type: 'string', description: 'First ~30 seconds of the script' }, keyword: { type: 'string' }, format: { type: 'string', enum: ['long', 'short'], default: 'long' } } } },
  { name: 'radar_watch', description: 'Live breakout watch: new uploads (yours and tracked competitors\') with views vs the channel\'s usual launch curve at the same age (velocity index), status (breakout/rising/on-track/lagging/stalled) and retention when available. run=true takes a fresh reading first (≈2 quota units per channel).',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' }, run: { type: 'boolean', default: false } } } },
  { name: 'radar_calibrate', description: 'Backtest the radar on the channel\'s own history (plus tracked competitors) and store calibrated weights. Reports holdout accuracy (Spearman, top-quartile hit rate vs base rate). AI features are cached, so reruns are cheap.',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' }, aiLimit: { type: 'integer', default: 60 }, ai: { type: 'boolean', default: true } } } },
  { name: 'daily_ideas', description: 'Today\'s radar-scored video ideas for a channel, each with 3 title options ranked on the virality radar, thumbnail text, a hook and the evidence it came from (competitor breakouts, your winners, real search terms, new autocomplete suggestions). run=true builds a fresh list first (AI; ~1–3 minutes).',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' }, run: { type: 'boolean', default: false }, count: { type: 'integer', default: 8 } } } },
  { name: 'autopilot', description: 'Diagnose lagging uploads and suggest titles and thumbnails. Copy suggestions for manual use.',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' }, action: { type: 'string', enum: ['list', 'run'], default: 'list' }, videoId: { type: 'string' }, actionId: { type: 'integer' } } } },
  { name: 'ctr_report', description: 'Impressions and impressions CTR per video and per day from the YouTube Reporting API (daily, ~2-day delay), the channel\'s usual first-days CTR, and high-impression videos with low CTR (packaging fix candidates). sync=true pulls new reports first.',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' }, days: { type: 'integer', default: 28 }, sync: { type: 'boolean', default: false } } } },
  { name: 'portfolio', description: 'Every channel you own on one board: views and subs this week vs last, the latest upload\'s pace and CTR, monetization progress, open alerts, autopilot activity, today\'s top idea. weekly=true also returns (and phones) the weekly summary text.',
    inputSchema: { type: 'object', properties: { weekly: { type: 'boolean', default: false } } } },
  { name: 'best_publish_time', description: 'Next best publish slots for a channel, learned from how your own uploads performed by local weekday and 3-hour block (shrunk toward neutral when data is thin). Use format "short" for Shorts.',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' }, format: { type: 'string', enum: ['long', 'short'] }, count: { type: 'integer', default: 3 } } } },
  // ---------- configuration: an AI can set Tubescope up end to end ----------
  { name: 'setup_status', description: 'Setup checklist for Tubescope: YouTube API key, Google sign-in app, AI provider, owned channels (and whether each is connected for analytics/uploads), competitors, Instagram, TikTok, voiceover, phone alerts, local transcription, ffmpeg, remote access. Each item says ok/missing and the exact next step (which tool to call with what). Call this first when anything seems unconfigured.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'get_settings', description: 'Tubescope settings with their meaning, type, allowed values and current value (secrets are masked; "set" tells whether a secret exists). Optionally filter by group: youtube, ai, radar, ideas, autopilot, publishing, voiceover, notifications, schedule, system.',
    inputSchema: { type: 'object', properties: { group: { type: 'string' } } } },
  { name: 'update_settings', description: 'Change Tubescope settings: pass {settings: {key: value, ...}} using keys from get_settings. Values are validated (types, allowed values, cron syntax); unknown keys are rejected. Setting yt_api_key also tests it against YouTube. Paths to programs on the Mac can only be changed from the Mac itself.',
    inputSchema: { type: 'object', required: ['settings'], properties: { settings: { type: 'object', additionalProperties: true } } } },
  { name: 'add_channel', description: 'Add a YouTube channel to Tubescope by @handle, channel URL or channel id. kind "owned" for the user\'s own channels (then connect it with connect_account service "google" for analytics/uploads); kind "competitor" tracks it for an owned channel (ownedChannelId, defaults to the first owned channel). Syncs its videos.',
    inputSchema: { type: 'object', required: ['input'], properties: { input: { type: 'string' }, kind: { type: 'string', enum: ['owned', 'competitor'], default: 'owned' }, ownedChannelId: { type: 'string' }, note: { type: 'string' } } } },
  { name: 'connect_account', description: 'Connect Google for read-only YouTube analytics. Returns the consent link to open on this Mac.',
    inputSchema: { type: 'object', required: ['service'], properties: { service: { type: 'string', enum: ['google', 'tiktok', 'instagram'] }, channel: { type: 'string', description: 'the brand (YouTube channel) this account belongs to' } } } },
  { name: 'test_notification', description: 'Send a test alert to the configured phone channels (iMessage, ntfy, webhook) and report which ones delivered.', inputSchema: { type: 'object', properties: {} } },
  { name: 'brands', description: 'Every brand the user runs: each owned YouTube channel with its linked Instagram and TikTok accounts, whether it is connected for analytics/uploads, and which accounts are the defaults. Use it to know which channel/account a request is about without asking.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'health', description: 'Tubescope check-up: database, backups, disk, YouTube quota, every channel\'s Google sign-in (incl. the 7-day "Testing" expiry), scheduled jobs, ffmpeg/transcriber and alerts — each problem with the exact fix. action "doctor" also texts new problems to the owner.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['check', 'doctor'], default: 'check' }, deep: { type: 'boolean', default: false } } } },
  { name: 'outlier_index', description: 'Search the user\'s own outlier database: every video Tubescope has indexed from their niches (it grows daily from spare quota), ranked by views ÷ that channel\'s average. Free (no quota). action "crawl" grows it now; "add_query" adds a topic to crawl.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['search', 'crawl', 'add_query', 'stats'], default: 'search' }, q: { type: 'string', description: 'topic words (full-text)' }, minX: { type: 'number', default: 3 }, format: { type: 'string', enum: ['all', 'long', 'shorts'], default: 'all' }, days: { type: 'integer', default: 365 }, maxSubs: { type: 'integer' }, sort: { type: 'string', enum: ['x', 'views', 'vpd', 'recent'], default: 'x' }, limit: { type: 'integer', default: 30 }, query: { type: 'string', description: 'for add_query' }, now: { type: 'boolean', description: 'add_query: index it right away (102 units)' } } } },
  { name: 'niche_finder', description: 'Small or young channels in the outlier index pulling outsized views — topics with room for a newcomer (faceless-channel research). Free.',
    inputSchema: { type: 'object', properties: { q: { type: 'string' }, maxSubs: { type: 'integer', default: 100000 }, limit: { type: 'integer', default: 20 } } } },
  { name: 'title_formulas', description: 'Proven title structures ("I Tried [X] for [N] Days") mined from outliers in the index and tracked channels: how many outliers use each and their median multiple, with real examples. Use before writing titles.',
    inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'niche/topic' }, minX: { type: 'number', default: 3 }, format: { type: 'string', enum: ['all', 'long', 'shorts'], default: 'all' }, limit: { type: 'integer', default: 15 } } } },
  { name: 'similar_thumbnails', description: 'Thumbnails that look like a given video\'s (or a local image you are designing), from every thumbnail Tubescope has seen, with views and outlier multiple. Free.',
    inputSchema: { type: 'object', properties: { videoId: { type: 'string' }, file: { type: 'string', description: 'absolute path to a JPG/PNG on this Mac' }, limit: { type: 'integer', default: 20 } } } },
  { name: 'rank_tracker', description: 'Where the user\'s videos rank in YouTube search for their keywords, checked daily (100 units per keyword): list with 7-day change and the top results; add/remove keywords; check now.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'add', 'remove', 'check'], default: 'list' }, channelId: { type: 'string' }, keyword: { type: 'string' }, id: { type: 'integer', description: 'for remove' } } } },
  { name: 'competitor_audience', description: 'What competitors\' viewers ask for and complain about: questions and requests under their best recent videos, grouped by topic (~1 unit per video, cached a day). Great video ideas.',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' } } } },
  { name: 'bulk_edit', description: 'Preview title, description or tag changes across videos. Copy the preview for manual use.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['preview', 'list'], default: 'preview' }, channelId: { type: 'string' }, videoIds: { type: 'array', items: { type: 'string' } }, q: { type: 'string', description: 'title contains' }, format: { type: 'string', enum: ['all', 'long', 'shorts'] }, since: { type: 'string' }, until: { type: 'string' }, ops: { type: 'array', items: { type: 'object' } }, batchId: { type: 'integer' } } } },
  { name: 'find_source_files', description: 'Find the original video file of each upload on this Mac (Movies, Downloads, Desktop, Documents — matched by exact length) so the autopilot can suggest thumbnails from frames.',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' } } } },
  { name: 'make_video', description: 'Render a local video from an idea for manual publishing.',
    inputSchema: { type: 'object', properties: { channelId: { type: 'string' }, topic: { type: 'string' }, script: { type: 'string' }, title: { type: 'string' }, background: { type: 'string', description: 'absolute path to a video/image, "ai", or omit for a branded card' }, voiceProvider: { type: 'string', enum: ['heygen', 'elevenlabs'] }, publish: { type: 'string', enum: ['review'], default: 'review' }, wait: { type: 'boolean', default: true } } } },
  { name: 'tubescope_api', description: 'Call any Tubescope REST endpoint (GET /api/... or POST /api/... with a JSON body). See GET /api/agent for the route list.',
    inputSchema: { type: 'object', required: ['path'], properties: { method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' }, path: { type: 'string', description: 'e.g. /api/channels' }, body: { type: 'object' } } } },
];

/**
 * Build the tool runner around a transport: call(method, path, body) → parsed JSON, throwing on HTTP errors.
 */
export function createToolRunner(call) {
  async function firstOwned() {
    const owned = await call('GET', '/api/channels?kind=owned');
    if (!owned.length) throw new Error('No owned channel in Tubescope yet — add one with add_channel (or setup_status for the full checklist).');
    return owned[0].id;
  }
  return async function runTool(name, a: Record<string, any> = {}) {
  switch (name) {
    case 'render_video': { const { wait = true, ...body } = a; return call('POST', `/api/render${wait ? '?wait=1&timeout=3600' : ''}`, body); }
    case 'media_transcode': { const { wait = true, ...body } = a; return call('POST', `/api/media/transcode${wait ? '?wait=1&timeout=3600' : ''}`, body); }
    case 'media_probe': return call('POST', '/api/media/probe', { file: a.file });
    case 'speech_segments': return call('POST', '/api/media/segments', a);
    case 'caption_timing': return call('POST', '/api/media/captions', a);
    case 'extract_frame': return call('POST', '/api/media/frame', a);
    case 'render_job': return call('GET', `/api/render/jobs/${encodeURIComponent(a.id)}${q({ wait: a.wait ? 1 : undefined, timeout: 3600 })}`);
    case 'voiceover': return call('POST', '/api/media/voiceover', a);
    case 'voiceover_short': { const { render = true, ...body } = a; return call('POST', `/api/media/voiceover/short${render ? '?wait=1' : ''}`, { ...body, render }); }
    case 'voiceover_voices': { const voices = await call('GET', `/api/media/voiceover/voices${q({ provider: a.provider })}`); let quota = null; try { quota = await call('GET', `/api/media/voiceover/quota${q({ provider: a.provider })}`); } catch { /* optional */ } return { voices, quota }; }
    case 'make_thumbnails': { const { aiPrompt, ...body } = a; return call('POST', '/api/media/thumbnails', { ...body, ai: aiPrompt ? { prompt: aiPrompt } : null }); }
    case 'similar_channels': return call('GET', `/api/channels/${encodeURIComponent(a.channelId)}/similar-channels${q({ limit: a.limit, country: a.country })}`);
    case 'list_channels': return call('GET', `/api/channels${q({ kind: a.kind })}`);
    case 'channel_videos': return call('GET', `/api/channels/${encodeURIComponent(a.channelId)}/videos${q({ limit: a.limit, sort: a.sort })}`);
    case 'keyword_research': { const [explore, demand] = await Promise.all([call('GET', `/api/keywords/explore${q({ q: a.q, country: a.country })}`), call('GET', `/api/keywords/demand${q({ q: a.q, country: a.country })}`)]); return { demand, explore }; }
    case 'outliers': return call('GET', `/api/outliers/search${q({ q: a.q, days: a.days, maxSubs: a.maxSubs, format: a.format })}`);
    case 'radar_score': return call('POST', '/api/radar/score', { ...a, channelId: a.channelId || await firstOwned() });
    case 'radar_watch': { const id = a.channelId || await firstOwned(); if (a.run) await call('POST', '/api/radar/watch/run'); return call('GET', `/api/radar/watch/${encodeURIComponent(id)}`); }
    case 'radar_calibrate': { const id = a.channelId || await firstOwned(); return call('POST', `/api/radar/calibrate/${encodeURIComponent(id)}?wait=1&timeout=3600`, { aiLimit: a.aiLimit, ai: a.ai }); }
    case 'daily_ideas': { const id = a.channelId || await firstOwned(); if (a.run) return call('POST', `/api/ideas/${encodeURIComponent(id)}/run`, { count: a.count }); return call('GET', `/api/ideas/${encodeURIComponent(id)}`); }
    case 'autopilot': {
      if (a.action === 'run') { if (!a.videoId) throw new Error('videoId is required for action "run"'); return call('POST', `/api/autopilot/run/${encodeURIComponent(a.videoId)}`, {}); }
      return call('GET', `/api/autopilot/${encodeURIComponent(a.channelId || await firstOwned())}`);
    }
    case 'ctr_report': { const id = a.channelId || await firstOwned(); if (a.sync) await call('POST', `/api/reach/${encodeURIComponent(id)}/sync`, {}); return call('GET', `/api/reach/${encodeURIComponent(id)}?days=${a.days || 28}`); }
    case 'portfolio': return a.weekly ? call('POST', '/api/portfolio/weekly-summary', { send: true }) : call('GET', '/api/portfolio');
    case 'best_publish_time': { const id = a.channelId || await firstOwned(); return call('GET', `/api/slots/${encodeURIComponent(id)}?count=${a.count || 3}${a.format ? '&format=' + a.format : ''}`); }
    case 'setup_status': return call('GET', '/api/setup');
    case 'get_settings': return call('GET', `/api/config${q({ group: a.group })}`);
    case 'update_settings': { if (!a.settings || typeof a.settings !== 'object') throw new Error('settings must be an object of key: value'); return call('PUT', '/api/config', a.settings); }
    case 'add_channel': {
      if ((a.kind || 'owned') === 'competitor') return call('POST', `/api/competitors/${encodeURIComponent(a.ownedChannelId || await firstOwned())}`, { input: a.input, note: a.note || '' });
      return call('POST', '/api/channels', { input: a.input, kind: 'owned' });
    }
    case 'connect_account': return call('GET', `/api/setup/connect/${encodeURIComponent(a.service)}${q({ channel: a.channel })}`);
    case 'test_notification': return call('POST', '/api/notify/test', {});
    case 'brands': return call('GET', '/api/brands');
    case 'health': return a.action === 'doctor' ? call('POST', '/api/health/doctor', {}) : call('GET', `/api/health${q({ deep: a.deep ? 1 : undefined })}`);
    case 'outlier_index': {
      if (a.action === 'crawl') return call('POST', '/api/index/crawl?wait=1', {});
      if (a.action === 'add_query') return call('POST', '/api/index/queries', { query: a.query || a.q, now: a.now === true });
      if (a.action === 'stats') return call('GET', '/api/index/stats');
      return call('GET', `/api/index${q({ q: a.q, minX: a.minX, format: a.format, days: a.days, maxSubs: a.maxSubs, sort: a.sort, limit: a.limit || 30 })}`);
    }
    case 'niche_finder': return call('GET', `/api/niches${q({ q: a.q, maxSubs: a.maxSubs, limit: a.limit })}`);
    case 'title_formulas': return call('GET', `/api/formulas${q({ q: a.q, minX: a.minX, format: a.format, limit: a.limit || 15 })}`);
    case 'similar_thumbnails': return a.file ? call('POST', '/api/thumbnails/similar', { file: a.file, limit: a.limit }) : call('GET', `/api/thumbnails/similar${q({ videoId: a.videoId, limit: a.limit })}`);
    case 'rank_tracker': {
      if (a.action === 'add') return call('POST', '/api/ranks', { channelId: a.channelId || await firstOwned(), keyword: a.keyword });
      if (a.action === 'remove') return call('DELETE', `/api/ranks/${encodeURIComponent(a.id)}`);
      if (a.action === 'check') return call('POST', '/api/ranks/check', {});
      return call('GET', `/api/ranks${q({ channelId: a.channelId })}`);
    }
    case 'competitor_audience': return call('GET', `/api/competitor-audience/${encodeURIComponent(a.channelId || await firstOwned())}`);
    case 'bulk_edit': {
      const channelId = a.channelId || await firstOwned();
      if (a.action === 'list') return call('GET', `/api/bulk${q({ channelId })}`);
      return call('POST', '/api/bulk/preview', { channelId, videoIds: a.videoIds, q: a.q, format: a.format, since: a.since, until: a.until, ops: a.ops });
    }
    case 'find_source_files': return call('POST', '/api/sources/match', { channelId: a.channelId || null });
    case 'make_video': { const { wait = true, ...body } = a; return call('POST', `/api/make-video${wait ? '?wait=1' : ''}`, { ...body, channelId: a.channelId || await firstOwned() }); }
    case 'tubescope_api': {
      const raw = String(a.path || '');
      if (/\.\.|%2e|%2f|%5c|\\/i.test(raw)) throw new Error('path may not contain .. or encoded separators');
      const u = new URL(raw, 'http://tubescope.local');
      if (u.origin !== 'http://tubescope.local' || !u.pathname.startsWith('/api/')) throw new Error('path must start with /api/');
      const method = String(a.method || 'GET').toUpperCase();
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('method must be GET, POST, PUT or DELETE');
      return call(method, u.pathname + u.search, a.body);
    }
    default: throw new Error(`unknown tool ${name}`);
  }
  };
}

/** JSON-RPC (MCP) message handling shared by stdio and HTTP. Returns the response object, or null for notifications. */
export async function handleMcpMessage(req, { runTool, base, serverName = 'tubescope' }: { runTool?: ReturnType<typeof createToolRunner>; base?: string; serverName?: string }) {
  const { id, method, params } = req || {};
  const ok = result => (id === undefined || id === null ? null : { jsonrpc: '2.0', id, result });
  const fail = (code, message) => (id === undefined || id === null ? null : { jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') {
      const supported = ['2025-06-18', '2025-03-26', '2024-11-05'];
      const protocolVersion = supported.includes(params?.protocolVersion) ? params.protocolVersion : supported[0];
      let brands = '';
      try { brands = brandsText(await Promise.race([runTool('brands', {}), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))])); } catch { /* Tubescope not running yet */ }
      return ok({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: serverName, title: 'Tubescope', version: VERSION }, instructions: INSTRUCTIONS(base) + brands });
    }
    if (method === 'notifications/initialized' || method === 'initialized' || method?.startsWith('notifications/')) return null;
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools: TOOLS });
    if (method === 'tools/call') {
      try { const r = await runTool(params?.name, params?.arguments || {}); return ok({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: false }); }
      catch (e) { return ok({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }); }
    }
    if (method === 'resources/list') return ok({ resources: [] });
    if (method === 'resources/templates/list') return ok({ resourceTemplates: [] });
    if (method === 'prompts/list') return ok({ prompts: [] });
    return fail(-32601, `method not found: ${method}`);
  } catch (e) { return fail(-32000, e.message); }
}
