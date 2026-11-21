import { getSetting } from '../db.ts';
import { env } from '../lib/env.ts';
import { fetchRetry } from '../lib/http.ts';

export const DEFAULT_REPORTS_PAGE_ID = '41fb9c2f64fc80d9ae97f2b000b7151d';
export const notionToken = () => getSetting('notion_token') || env('NOTION_TOKEN');
const pageUrl = id => `https://www.notion.so/${id.replaceAll('-', '')}`;

async function request(path: string, method = 'GET', body?) {
  const token = notionToken();
  if (!token) throw new Error('Set notion_token in Settings before publishing a weekly report.');
  let res: Response;
  try {
    res = await fetchRetry(`${(process.env.NOTION_API_BASE || 'https://api.notion.com/v1').replace(/\/$/, '')}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
    });
  } catch {
    // Never surface upstream bodies or transport errors: they may contain credentials.
    throw new Error('Could not reach Notion. Check the connection and try again.');
  }
  if (res.status === 401) throw new Error('Notion rejected the token. Check notion_token in Settings.');
  if (res.status === 404) throw new Error('Notion page not found. Share the page with your internal integration and check notion_reports_page_id.');
  if (!res.ok) throw new Error(`Notion request failed (HTTP ${res.status}). Check the integration permissions and try again.`);
  try {
    return await res.json();
  } catch {
    throw new Error('Notion returned an invalid response.');
  }
}

export async function createPage(parentId: string, title: string, blocks: unknown[]) {
  const page = await request('/pages', 'POST', {
    parent: { page_id: parentId },
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: blocks.slice(0, 100),
  });
  for (let i = 100; i < blocks.length; i += 100)
    await request(`/blocks/${encodeURIComponent(page.id)}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
  return { id: page.id, url: page.url || pageUrl(page.id) };
}

export async function findChildPage(parentId: string, title: string) {
  let cursor = '';
  do {
    const result = await request(
      `/blocks/${encodeURIComponent(parentId)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`
    );
    const page = result.results.find(b => b.type === 'child_page' && b.child_page?.title === title);
    if (page) return { id: page.id, url: pageUrl(page.id) };
    cursor = result.has_more ? result.next_cursor : '';
  } while (cursor);
  return null;
}
