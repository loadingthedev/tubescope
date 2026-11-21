// Calendar-week reports use only the local database. Do not call portfolio.overview(): it may fetch analytics.
import { allSettings, db, getSetting, type DbRow } from '../db.ts';
import { median } from './stats.ts';
import * as notion from './notion.ts';

const DAY = 86400000;
// A prolific channel has a low median, so it can fill every slot; cap it so other competitors show up.
const perChannel = (rows, limit: number, cap = 3) => {
  const seen: Record<string, number> = {};
  return rows.filter(v => (seen[v.channel_id] = (seen[v.channel_id] || 0) + 1) <= cap).slice(0, limit);
};
const shift = (day: string, days: number) => new Date(Date.parse(day) + days * DAY).toISOString().slice(0, 10);
const n = (value: number) => value.toLocaleString('en-US');
const escapeMarkdown = (s: string) =>
  s
    .replaceAll('\\', '\\\\')
    .replace(/([[\]*_`])/g, '\\$1')
    .replaceAll('\n', ' ');
type RichText = { type: 'text'; text: { content: string; link?: { url: string } } };

export function buildWeeklyReport(channelId?: string, { now = new Date() }: { now?: Date } = {}) {
  const tz = getSetting('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const localDay = (value: string | Date) => {
    // SQLite datetime strings are UTC, even though they lack a suffix.
    const date = typeof value === 'string' ? new Date(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + 'Z' : value) : value;
    if (!Number.isFinite(date.getTime())) return '';
    const parts = formatter.formatToParts(date);
    return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k).value).join('-');
  };
  const today = localDay(now);
  const weekday = new Date(today).getUTCDay();
  const end = shift(today, -((weekday + 6) % 7)); // This Monday, exclusive.
  const start = shift(end, -7);
  const last = shift(end, -1);
  const dateLabel = day => new Date(day).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  const title = `Tubescope week of ${start.slice(0, 7) === last.slice(0, 7) ? Number(start.slice(-2)) : dateLabel(start)}–${dateLabel(last)}`;
  const blocks = [];
  const lines = [`# ${title}`, ''];
  function add(type: string, text: string, link?: { title: string; url: string }) {
    const pieces = link ? [{ content: link.title, link: { url: link.url } }, { content: text }] : [{ content: text }];
    const rich_text: RichText[] = [];
    for (const p of pieces) {
      // Split at code point boundaries; every text object stays within Notion's 2000-character limit.
      let content = '';
      for (const char of p.content) {
        if (content.length + char.length > 2000) {
          rich_text.push({ type: 'text', text: { ...p, content } });
          content = '';
        }
        content += char;
      }
      if (content) rich_text.push({ type: 'text', text: { ...p, content } });
    }
    // Keep rich-text arrays small as well as individual text objects.
    for (let i = 0; i < Math.max(1, rich_text.length); i += 100) blocks.push({ object: 'block', type, [type]: { rich_text: rich_text.slice(i, i + 100) } });
    const prefix = type === 'heading_2' ? '## ' : type === 'heading_3' ? '### ' : type === 'bulleted_list_item' ? '- ' : '';
    lines.push(prefix + (link ? `[${escapeMarkdown(link.title)}](${link.url})` : '') + escapeMarkdown(text), '');
  }
  const inWeek = value => {
    const day = localDay(value);
    return day >= start && day < end;
  };
  const channels = db
    .prepare("SELECT id, title FROM channels WHERE kind = 'owned' ORDER BY id")
    .all()
    .filter(c => !channelId || c.id === channelId);
  const library = db.prepare('SELECT v.*, c.title AS channel_title FROM videos v JOIN channels c ON c.id = v.channel_id WHERE v.is_live = 0').all();
  const groups = new Map<string, number[]>();
  for (const v of library) {
    const key = `${v.channel_id}:${v.is_short ? 's' : 'l'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v.view_count);
  }
  const scored = library.map((v): DbRow & { x: number | null } => {
    const baseline = median(groups.get(`${v.channel_id}:${v.is_short ? 's' : 'l'}`));
    return { ...v, x: baseline > 0 ? v.view_count / baseline : null };
  });
  const ranked = rows => rows.sort((a, b) => b.x - a.x || b.view_count - a.view_count || a.id.localeCompare(b.id));
  const videoLine = (v, channel = false) =>
    add(
      'bulleted_list_item',
      ` — ${channel ? v.channel_title + ' · ' : ''}${v.is_short ? 'Shorts' : 'long'} · ${n(v.view_count)} views · ${v.x === null ? '× unavailable (zero median)' : v.x.toFixed(1) + '×'}`,
      {
        title: v.title || v.id,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
      }
    );
  const snapshots = new Map<string, DbRow>();
  const boundaries = [shift(start, -7), start, end];
  for (const snapshot of db.prepare('SELECT * FROM snapshots ORDER BY taken_at').iterate()) {
    const day = localDay(snapshot.taken_at);
    if (!day) continue;
    for (const boundary of boundaries)
      if (day < boundary) snapshots.set(`${snapshot.entity_type}:${snapshot.entity_id}:${boundary}`, { ...snapshot, local_day: day });
  }
  const snapAt = (type, id, before) => snapshots.get(`${type}:${id}:${before}`);
  const delta = (type, id, from, to, field) => {
    const a = snapAt(type, id, from),
      b = snapAt(type, id, to);
    return a && b && a.id !== b.id && b.local_day >= from ? b[field] - a[field] : null;
  };
  if (!channels.length) add('paragraph', 'No owned channels yet.');
  for (const c of channels) {
    add('heading_2', c.title || c.id);
    add('heading_3', 'Headline numbers');
    for (const [field, label] of [
      ['views', 'Views gained'],
      ['subs', 'Subscribers gained'],
    ]) {
      const current = delta('channel', c.id, start, end, field);
      const previous = delta('channel', c.id, shift(start, -7), start, field);
      add(
        'paragraph',
        `${label}: ${current === null ? 'not enough snapshots yet' : n(current) + ' est.'}; last week: ${previous === null ? 'not enough snapshots yet' : n(previous) + ' est.'}`
      );
    }
    const gainers = library
      .filter(v => v.channel_id === c.id)
      .map((v): DbRow & { gained: number | null } => {
        const endSnap = snapAt('video', v.id, end);
        const gained = inWeek(v.published_at) && endSnap && endSnap.local_day >= start ? endSnap.views : delta('video', v.id, start, end, 'views');
        return { ...v, gained };
      })
      .filter(v => v.gained !== null)
      .sort((a, b) => b.gained - a.gained);
    if (gainers.length)
      add('paragraph', ` — best video by views gained: ${n(gainers[0].gained)} est.`, {
        title: gainers[0].title || gainers[0].id,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(gainers[0].id)}`,
      });
    else add('paragraph', 'Best video by views gained: not enough snapshots yet.');
    add('heading_3', 'Our uploads this week');
    const uploads = scored.filter(v => v.channel_id === c.id && inWeek(v.published_at)).sort((a, b) => a.published_at.localeCompare(b.published_at));
    if (!uploads.length) add('paragraph', 'No uploads this week.');
    uploads.forEach(v => videoLine(v));
    add('heading_3', 'Competitor breakouts this week');
    const competitors = new Set(
      db
        .prepare('SELECT competitor_channel_id AS id FROM competitor_links WHERE owned_channel_id = ?')
        .all(c.id)
        .map(r => r.id)
    );
    const breakouts = perChannel(ranked(scored.filter(v => competitors.has(v.channel_id) && inWeek(v.published_at) && v.x !== null && v.x >= 3)), 10);
    if (!breakouts.length) add('paragraph', 'No competitor breakouts this week.');
    breakouts.forEach(v => videoLine(v, true));
    add('heading_3', 'Outliers worth copying');
    const excluded = new Set(breakouts.map(v => v.id));
    const outliers = perChannel(
      ranked(
        scored.filter(v => {
          const published = Date.parse(v.published_at);
          return published >= now.getTime() - 30 * DAY && published <= now.getTime() && v.x !== null && v.x >= 3 && !excluded.has(v.id);
        })
      ),
      10
    );
    if (!outliers.length) add('paragraph', 'No other local outliers in the last 30 days.');
    outliers.forEach(v => videoLine(v, true));
    add('heading_3', 'Radar alerts this week');
    const alerts = db
      .prepare("SELECT * FROM alerts WHERE (channel_id = ? OR channel_id IS NULL) AND kind GLOB 'radar_*' ORDER BY created_at DESC")
      .all(c.id)
      .filter(a => inWeek(a.created_at));
    add('paragraph', `${alerts.length} radar alerts.`);
    alerts.slice(0, 5).forEach(a => add('bulleted_list_item', a.title));
    // A fresh database may not have loaded the ideas service (and thus its optional table) yet.
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'radar_ideas'").get()) {
      const ideas = db
        .prepare(
          "SELECT * FROM radar_ideas WHERE channel_id = ? AND day >= ? AND day < ? AND status != 'dismissed' ORDER BY day DESC, rank, score DESC LIMIT 5"
        )
        .all(c.id, start, end);
      if (ideas.length) {
        add('heading_3', "Today's ideas");
        ideas.forEach(i => add('bulleted_list_item', `${i.best_title}${i.predicted_x == null ? '' : ` · ${i.predicted_x.toFixed(1)}× est.`}`));
      }
    }
  }
  add('paragraph', `Week: ${start}–${last} (${tz}). Upload views and medians are current local counts. The 30-day outlier window ends at generation time.`);
  add('paragraph', "Generated by Tubescope from local data. × = views ÷ the channel's median views for the same format. Estimates are labelled est.");
  return { title, markdown: lines.join('\n').trim() + '\n', blocks };
}

// Coalesce simultaneous scheduler/API publishes so they cannot create duplicate pages in this process.
let publishing: ReturnType<typeof publish> | null = null;
export function publishWeeklyReport({ dryRun = false }: { dryRun?: boolean } = {}) {
  if (dryRun) return publish(true);
  if (publishing === null)
    publishing = publish(false).finally(() => {
      publishing = null;
    });
  return publishing;
}
async function publish(dryRun: boolean) {
  if (!notion.notionToken()) return { skipped: true, reason: 'notion_token is not configured.' };
  const parentId = allSettings().notion_reports_page_id ?? notion.DEFAULT_REPORTS_PAGE_ID;
  if (!parentId.trim()) return { skipped: true, reason: 'notion_reports_page_id is not configured.' };
  const report = buildWeeklyReport();
  if (dryRun) return { dryRun: true, title: report.title, markdown: report.markdown };
  const existing = await notion.findChildPage(parentId, report.title);
  if (existing) return { exists: true, url: existing.url };
  const page = await notion.createPage(parentId, report.title, report.blocks);
  return { created: true, url: page.url, pageId: page.id };
}
