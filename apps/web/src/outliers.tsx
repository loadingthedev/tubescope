import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelsResponse, LocalOutlierVideo, OutlierSearchResponse, SettingsResponse } from '@tubescope/shared';
import { getJson } from './api';
import { ChannelSelect, PageHeader, QueryError, StatCard, Tabs, useOwnedChannel } from './components/research';
import { VideoTable } from './components/video-table';

function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

const tabs = ['Our channels + competitors', 'Search a topic'];
function FormatSelect({ name, initial }: { name: string; initial: string }) {
  return (
    <label>
      Format
      <select name={name} defaultValue={initial}>
        <option value="long">Long-form</option>
        <option value="shorts">Shorts</option>
        <option value="all">All</option>
      </select>
    </label>
  );
}
function Library({ ownedId }: { ownedId: string }) {
  const competitors = useQuery({
    queryKey: ['competitors', ownedId, 'list'],
    queryFn: ({ signal }) => getJson<ChannelsResponse>(`/competitors/${ownedId}`, signal),
  });
  const [params, setParams] = useState('');
  const result = useQuery({
    queryKey: ['outliers', 'local', ownedId, params],
    queryFn: ({ signal }) => getJson<LocalOutlierVideo[]>(`/outliers/local?${params}`, signal),
    enabled: Boolean(params),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const channels = data.get('channels') === 'all' ? [ownedId, ...(competitors.data || []).map(c => c.id)].join(',') : field(data, 'channels');
    const next = new URLSearchParams({
      channels,
      format: field(data, 'format'),
      minX: field(data, 'minX'),
      days: field(data, 'days'),
    }).toString();
    if (next === params) void result.refetch();
    else setParams(next);
  }
  return (
    <>
      <form className="search-form filters" onSubmit={submit}>
        <FormatSelect name="format" initial="long" />
        <label>
          Minimum ×<input name="minX" type="number" min="0" step="0.5" defaultValue="2" required />
        </label>
        <label>
          Within days
          <input name="days" type="number" min="1" defaultValue="365" required />
        </label>
        <label>
          Channel
          <select name="channels">
            <option value="all">All selected channels</option>
            <option value={ownedId}>Our channel</option>
            {competitors.data?.map(channel => (
              <option key={channel.id} value={channel.id}>
                {channel.title}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary-button" disabled={competitors.isPending || competitors.isError || result.isFetching}>
          Find outliers
        </button>
        <p className="search-hint">Synced library · No API quota used</p>
      </form>
      {competitors.isError ? <QueryError error={competitors.error} retry={() => void competitors.refetch()} /> : null}
      {result.isFetching ? <p role="status">Finding library outliers…</p> : null}
      {result.isError ? <QueryError error={result.error} retry={() => void result.refetch()} /> : null}
      {result.data ? (
        <>
          <VideoTable rows={result.data} />
          <p className="source-note">Outlier × = views ÷ median views of the same channel and format in the selected library window.</p>
        </>
      ) : !params ? (
        <p className="muted">Choose filters, then find outliers.</p>
      ) : null}
    </>
  );
}
function TopicSearch() {
  const [params, setParams] = useState('');
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => getJson<SettingsResponse>('/settings', signal) });
  const result = useQuery({
    queryKey: ['outliers', 'search', params],
    queryFn: async ({ signal }) => {
      try {
        return await getJson<OutlierSearchResponse>(`/outliers/search?${params}`, signal);
      } finally {
        void client.invalidateQueries({ queryKey: ['quota'] });
      }
    },
    enabled: Boolean(params),
    staleTime: 86_400_000,
    retry: false,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams({
      q: field(data, 'q').trim(),
      days: field(data, 'days'),
      format: field(data, 'format'),
      maxSubs: field(data, 'maxSubs'),
      order: field(data, 'order'),
      country: settings.data?.default_country || 'US',
      ...(data.get('baseline') ? { baseline: '1' } : {}),
    }).toString();
    if (next === params) void result.refetch();
    else setParams(next);
  }
  return (
    <>
      <form className="search-form filters" onSubmit={submit}>
        <label>
          Topic
          <input name="q" type="search" placeholder="e.g. medicaid for parents" required maxLength={200} />
        </label>
        <label>
          Period
          <select name="days" defaultValue="90">
            {[7, 30, 90, 365].map(days => (
              <option key={days} value={days}>
                Last {days} days
              </option>
            ))}
          </select>
        </label>
        <FormatSelect name="format" initial="all" />
        <label>
          Max subs
          <input name="maxSubs" type="number" min="1" placeholder="Any" />
        </label>
        <label>
          Sort
          <select name="order" defaultValue="viewCount">
            <option value="viewCount">Most viewed</option>
            <option value="date">Newest</option>
            <option value="relevance">Relevance</option>
          </select>
        </label>
        <label className="check-label">
          <input name="baseline" type="checkbox" />
          Compare with each channel's normal
        </label>
        <p className="search-hint">≈2 API units per channel, cached 24h</p>
        <button type="submit" className="primary-button" disabled={result.isFetching}>
          Search
        </button>
        <p className="search-hint">
          YouTube search costs 100+ API units. Initial results rank by views ÷ subscribers and views/day; use table headers to sort.
        </p>
      </form>
      {result.isFetching ? <p role="status">Searching YouTube and comparing channels…</p> : null}
      {result.isError ? <QueryError error={result.error} retry={() => void result.refetch()} /> : null}
      {result.data ? (
        <>
          <div className="metrics">
            <StatCard label="Search sample" value={result.data.sampleSize} note="Matching videos" />
          </div>
          {result.data.baselinePartial ? (
            <p role="status" className="error-message">
              Quota is low. Some channel baselines are unavailable.
            </p>
          ) : null}
          <VideoTable rows={result.data.results} />
          <p className="source-note">{result.data.source}</p>
          <p className="source-note">
            Channel normal uses up to 30 recent uploads, separated by format, excluding the result itself. A ratio needs at least 5 comparable uploads and a
            nonzero median. Shorts classification uses duration and #shorts markers; the API does not expose aspect ratio.
          </p>
        </>
      ) : !params ? (
        <div className="empty-state">
          <h2>Search a topic</h2>
          <p>Find videos that break out beyond their channel's usual audience.</p>
        </div>
      ) : null}
    </>
  );
}
export function Outliers() {
  const [tab, setTab] = useState(tabs[0]);
  const channel = useOwnedChannel();
  return (
    <>
      <PageHeader
        title="Outliers"
        description="Find videos performing above their channel's normal views. Library research uses synced data; topic search samples YouTube."
      />
      <ChannelSelect channel={channel} />
      <Tabs labels={tabs} value={tab} onChange={setTab} />
      {tab === tabs[1] ? (
        <TopicSearch />
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.channels.isPending ? (
        <p role="status">Loading channels…</p>
      ) : channel.current ? (
        <Library key={channel.current.id} ownedId={channel.current.id} />
      ) : (
        <p className="empty-state">Add an owned channel in the classic UI to use library outliers.</p>
      )}
    </>
  );
}
