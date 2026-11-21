// Daily jobs: snapshot every channel + video (history charts, growth, forecasts),
// refresh competitors (upload feed, breakout alerts, packaging-change history).
import cron from 'node-cron';
import * as jobs from '../services/jobs.ts';
import * as backup from '../services/backup.ts';
import * as health from '../services/health.ts';
import * as research from '../services/research.ts';
import { db, getSetting, setSetting, today } from '../db.ts';
import { listChannels, refreshChannel, syncVideos } from '../services/channels.ts';
import { refreshAll, addAlert } from '../services/competitors.ts';
import { watchTick, calibrate, buildCorpus } from '../services/radar.ts';
import * as reach from '../services/reach.ts';
import * as ideas from '../services/ideas.ts';
import * as portfolio from '../services/portfolio.ts';
import { publishWeeklyReport } from '../services/weekly-report.ts';
import { aiAvailable } from '../services/radar.ts';

let running = null;
export function runDailySnapshot(opts: Parameters<typeof runDailySnapshotInner>[0] = {}) {
  if (running) return running;
  running = runDailySnapshotInner(opts).finally(() => {
    running = null;
  });
  return running;
}
async function runDailySnapshotInner({ log = console.log }: { log?: (message: string, ...details: unknown[]) => void } = {}) {
  const started = Date.now();
  const summary = { channels: 0, videos: 0, alerts: 0, errors: [] };
  for (const ch of listChannels('owned')) {
    try {
      await refreshChannel(ch.id, { force: true });
      const r = await syncVideos(ch.id, { maxVideos: Number(getSetting('sync_depth_owned', 500)), force: true });
      summary.channels++;
      summary.videos += r.synced;
      if (r.metadataChanges) addAlert(ch.id, 'own_metadata_change', `${r.metadataChanges} metadata change(s) recorded on ${ch.title}`, {});
      const c = await refreshAll(ch.id, { maxVideos: Number(getSetting('sync_depth_competitor', 50)) });
      summary.alerts += c.alerts.length;
    } catch (e) {
      summary.errors.push(`${ch.title}: ${e.message}`);
      log('[snapshot]', ch.title, e.message);
    }
  }
  // Competitors not linked to any owned channel (added standalone) still get a daily snapshot.
  for (const ch of listChannels('competitor')) {
    const linked = db.prepare('SELECT 1 FROM competitor_links WHERE competitor_channel_id = ?').get(ch.id);
    if (linked) continue;
    try {
      await refreshChannel(ch.id, { force: true });
      summary.channels++;
    } catch (e) {
      summary.errors.push(`${ch.title}: ${e.message}`);
    }
  }
  db.prepare("INSERT INTO settings(key, value) VALUES ('last_snapshot', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    JSON.stringify({ day: today(), at: new Date().toISOString(), ms: Date.now() - started, ...summary })
  );
  log(`[snapshot] done in ${Date.now() - started}ms`, summary);
  return summary;
}

export function startScheduler() {
  const expr = getSetting('snapshot_cron', '15 6 * * *'); // 06:15 local every day
  const tz = getSetting('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (!cron.validate(expr)) {
    console.warn('[scheduler] invalid cron expression', expr);
    return null;
  }
  // Snapshot errors per channel are collected, not thrown; a run where every channel failed counts as a failure
  // so the catch-up tick tries again (e.g. after the network or the quota comes back).
  const task = jobs.schedule(
    'snapshot',
    expr,
    async () => {
      const r = await runDailySnapshot();
      if (r.errors.length && !r.channels) throw new Error(r.errors.join('; '));
      return r;
    },
    {
      tz,
      label: 'Daily snapshot',
      runIfNeverRun: () =>
        listChannels().length > 0 &&
        (() => {
          try {
            return JSON.parse(getSetting('last_snapshot', '{}')).day !== today();
          } catch {
            return true;
          }
        })(),
    }
  );
  console.log(`[scheduler] daily snapshot at "${expr}" (${tz})`);
  startRadar(tz);
  startAutopilotJobs(tz);
  startCareJobs(tz);
  startResearchJobs(tz);
  jobs.startCatchUp();
  return task;
}

// Research that grows every day: the outlier index (spare quota → searchable outliers, niches, formulas, thumbnails)
// and keyword rank checks. Run after the Pacific quota reset (≈3 am Eastern) and before the morning snapshot.
export function startResearchJobs(tz) {
  jobs.schedule('index', getSetting('index_cron', '0 5 * * *'), () => research.crawl({ log: console.log }), { tz, label: 'Outlier index' });
  jobs.schedule('ranks', getSetting('rank_cron', '40 5 * * *'), () => research.checkAllRanks(), { tz, label: 'Search rank check' });
  // find each upload's source file on this Mac (so Shorts can be cut from any video)
  jobs.schedule('sources', getSetting('sources_cron', '20 5 * * *'), async () => (await import('../services/workflow.ts')).matchSources(null), {
    tz,
    label: 'Find source files',
  });
}

// Keeping Tubescope itself healthy: nightly backup + housekeeping, a morning check-up.
export function startCareJobs(tz) {
  jobs.schedule(
    'backup',
    getSetting('backup_cron', '30 3 * * *'),
    async () => {
      const r = await backup.create();
      backup.maintenance();
      jobs.prune();
      return r;
    },
    { tz, label: 'Nightly backup' }
  );
  jobs.schedule('doctor', getSetting('doctor_cron', '20 8 * * *'), () => health.doctor(), { tz, label: 'Morning check-up' });
}

// Daily: pull impressions + CTR from the Reporting API, then build the morning idea list and send the top 3.
export function startAutopilotJobs(tz) {
  const reachExpr = getSetting('reach_cron', '25 7 * * *');
  const ideasExpr = getSetting('ideas_cron', '50 6 * * *');
  jobs.schedule(
    'reach',
    reachExpr,
    async () => {
      await reach
        .syncAll()
        .then(r => console.log('[reach]', r))
        .catch(e => console.error('[reach]', e.message)); // the Reporting API keeps history: tomorrow's run fills any gap
    },
    { tz, label: 'CTR sync' }
  );
  jobs.schedule(
    'notion_report',
    getSetting('notion_report_cron', '30 8 * * 1'),
    async () => {
      if (getSetting('notion_report_enabled', '1') !== '1') return;
      const result = await publishWeeklyReport();
      if ('url' in result) console.log('[notion_report]', result.url);
      return result;
    },
    { tz, label: 'Weekly Notion report' }
  );
  // Weekly summary Monday morning.
  jobs.schedule('weekly', getSetting('weekly_summary_cron', '10 8 * * 1'), () => portfolio.weeklySummary(), { tz, label: 'Weekly summary' });
  if (getSetting('ideas_enabled', '1') === '1') jobs.schedule('ideas', ideasExpr, () => runIdeas(), { tz, label: 'Daily ideas' });
  console.log(`[scheduler] reach sync "${reachExpr}", daily ideas "${ideasExpr}" (${tz})`);
  if (listChannels('owned').length)
    setTimeout(() => {
      void reach.syncAll().catch(() => {});
    }, 60_000).unref?.();
}
export async function runIdeas() {
  if (getSetting('ideas_enabled', '1') !== '1' || !aiAvailable() || !listChannels('owned').length) return [];
  const r = await ideas.runAll();
  setSetting('ideas_last_day', today());
  console.log('[ideas]', r);
  return r;
}

// Virality radar: hourly launch-curve watch of new uploads (≈2 quota units per channel per hour) and a weekly
// recalibration per owned channel (AI features are cached, so only new videos cost an AI call).
export function startRadar(tz) {
  if (getSetting('radar_enabled', '1') !== '1') {
    console.log('[scheduler] radar disabled');
    return;
  }
  const watchExpr = getSetting('radar_watch_cron', '7 * * * *');
  const calExpr = getSetting('radar_calibrate_cron', '40 6 * * 0');
  jobs.schedule('radar_watch', watchExpr, () => watchTick({ log: console.log }), { tz, catchUp: false, label: 'Radar live watch' });
  jobs.schedule('radar_calibrate', calExpr, () => runWeeklyCalibration(), { tz, label: 'Radar calibration' });
  console.log(`[scheduler] radar watch "${watchExpr}", calibration "${calExpr}" (${tz})`);
  if (listChannels('owned').length) setTimeout(() => jobs.runJob('radar_watch', 'start').catch(() => {}), 45_000).unref?.();
}
export async function runWeeklyCalibration() {
  const out = [];
  for (const ch of listChannels('owned')) {
    if (buildCorpus(ch.id).filter(r => r.y !== null).length < 12) {
      out.push({ channel: ch.title, skipped: 'not enough history' });
      continue;
    }
    try {
      const m = await calibrate(ch.id, { useAI: getSetting('radar_calibrate_ai', '1') === '1' });
      out.push({ channel: ch.title, model: m.id, verdict: m.metrics?.holdout?.verdict });
    } catch (e) {
      out.push({ channel: ch.title, error: e.message });
    }
  }
  console.log('[radar] weekly calibration', out);
  return out;
}
