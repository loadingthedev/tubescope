import { env } from './lib/env.ts';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getSetting, DATA_DIR } from './db.ts';
import { api, oauthCallback } from './routes/api.ts';
import { startScheduler } from './jobs/scheduler.ts';

// A forgotten .catch() somewhere must not take the whole desk down (Node exits on unhandled rejections by default).
process.on('unhandledRejection', e => console.error('[unhandled]', (e as Error)?.stack || e));
// A real crash leaves state unknown: log it and exit so launchd starts a clean process.
process.on('uncaughtException', e => { console.error('[crash]', (e as Error)?.stack || e); try { db.close(true); } catch { /* */ } process.exit(1); });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(true); } catch { /* */ } process.exit(0); });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.text({ type: 'text/csv', limit: '25mb' }));

// Local-only by default: refuse non-loopback clients unless explicitly allowed. Requests that arrive through a
// Cloudflare tunnel or reverse proxy (X-Forwarded-For / CF-Connecting-IP set) may only fetch /public/media.
app.use((req, res, next) => {
  const ip = req.socket.remoteAddress || '';
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const proxied = !!(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']);
  if (proxied) return res.status(403).send('Not available through the public URL.');
  const lan = getSetting('allow_lan', '0') === '1';
  if (!local && !lan) return res.status(403).send('Tubescope only accepts local connections (set allow_lan=1 in Settings to expose on your LAN).');
  // DNS rebinding: a web page can point its own hostname at 127.0.0.1. Only answer requests addressed to this machine.
  const host = String(req.headers.host || '').toLowerCase();
  if (!lan && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return res.status(421).send('Unexpected Host header.');
  // CSRF: browsers send Origin on cross-site requests. State-changing requests must come from Tubescope's own pages,
  // the browser extension or youtube.com (extension content scripts); local tools (curl, MCP, scripts) send no Origin.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    const site = req.headers['sec-fetch-site'];
    let sameOrigin = false;
    try { sameOrigin = !!origin && (new URL(origin).host.toLowerCase() === host); } catch { /* malformed */ }
    const trustedOrigin = !origin || sameOrigin || /^(chrome|moz)-extension:\/\//.test(origin) || /^https:\/\/(www\.)?youtube\.com$/.test(origin);
    if (!trustedOrigin || (site === 'cross-site' && !sameOrigin && !/^(chrome|moz)-extension:|^https:\/\/(www\.)?youtube\.com$/.test(origin || ''))) return res.status(403).json({ error: 'Cross-site request refused.' });
  }
  // Calls relayed for remote AI apps may only use the API (which applies its own remote rules).
  if (req.headers['x-tubescope-origin'] === 'remote' && !req.path.startsWith('/api/')) return res.status(403).json({ error: 'Remote apps can only use the Tubescope API.' });
  next();
});

// CORS for the browser extension (chrome-extension:// origins) and youtube.com content scripts.
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (/^(chrome|moz)-extension:\/\//.test(origin) || /^https:\/\/(www\.)?youtube\.com$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

app.use('/api', api);
app.use(oauthCallback());
app.use('/data/thumbs', express.static(path.join(DATA_DIR, 'thumbs')));
app.use('/data/voiceovers', express.static(path.join(DATA_DIR, 'voiceovers')));
app.use('/data/renders', express.static(path.join(DATA_DIR, 'renders')));
app.use('/data/made', express.static(path.join(DATA_DIR, 'made')));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const PORT = Number(process.env.PORT || getSetting('port', 4949));
const server = app.listen(PORT, getSetting('allow_lan', '0') === '1' ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Tubescope running at http://localhost:${PORT}`);
  if (env('NO_SCHEDULER') !== '1') startScheduler();

});

// Loopback on IPv6 too, so "localhost" connects at once whichever address the browser tries first.
if (getSetting('allow_lan', '0') !== '1') app.listen(PORT, '::1').on('error', () => { /* no IPv6 loopback: fine */ });
// Port taken (an old copy still running): say so plainly and exit non-zero so launchd retries shortly.
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use — another Tubescope is running. Retrying via launchd.` : e.message); process.exit(1); });
