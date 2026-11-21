import { ageDays, format } from './components/format';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompetitorComparisonResponse, CompetitorMetrics, CompetitorAlert, FeedVideo } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { ChannelSelect, PageHeader, QueryError, StatCard, Table, Tabs, useOwnedChannel } from './components/Research';
import { VideoTable } from './components/VideoTable';

const tabs = ['Comparison', 'Upload feed', 'Alerts'];
const metrics: { key: keyof CompetitorMetrics; label: string; percent?: boolean }[] = [
  { key: 'subscribers', label: 'Subscribers' },
  { key: 'totalViews', label: 'Total views' },
  { key: 'totalVideos', label: 'Videos' },
  { key: 'viewsPerVideo', label: 'Views / video' },
  { key: 'medianViewsLong', label: 'Median long-form views' },
  { key: 'medianViewsShorts', label: 'Median Shorts views' },
  { key: 'uploadsPerWeek', label: 'Uploads / week (30d)' },
  { key: 'recentMedianViews', label: 'Median views, last 30d uploads' },
  { key: 'engagement', label: 'Engagement (likes+comments ÷ views)', percent: true },
  { key: 'subsGrowthN', label: 'Subs gained (snapshot window)' },
  { key: 'viewsGrowthN', label: 'Views gained (snapshot window)' },
  { key: 'snapshotDays', label: 'Days of snapshots' },
  { key: 'librarySynced', label: 'Videos synced' },
];
function Comparison({
  data,
  ownedId,
  pending,
  untrack,
}: {
  data: CompetitorComparisonResponse;
  ownedId: string;
  pending: boolean;
  untrack: (id: string) => void;
}) {
  return (
    <>
      <div className="metrics">
        <StatCard label="Tracked competitors" value={data.channels.filter(channel => channel.id !== ownedId).length} note="Public channel data" />
      </div>
      {data.channels.length < 2 ? <p className="muted">Track a competitor to compare with your channel.</p> : null}
      <Table caption="Channel metrics comparison">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {data.channels.map(channel => (
              <th key={channel.id} scope="col">
                {channel.thumbnail ? <img className="avatar" src={channel.thumbnail} alt="" width="32" height="32" /> : null}
                {channel.title}
                {channel.id === ownedId ? (
                  <span className="badge accent">You</span>
                ) : (
                  <button type="button" className="text-button" disabled={pending} onClick={() => untrack(channel.id)}>
                    Untrack<span className="sr-only"> {channel.title}</span>
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map(metric => {
            const best = Math.max(...data.channels.map(channel => (typeof channel[metric.key] === 'number' ? Number(channel[metric.key]) : -Infinity)));
            return (
              <tr key={metric.key}>
                <th scope="row">{metric.label}</th>
                {data.channels.map(channel => {
                  const value = channel[metric.key] as number | null;
                  return (
                    <td key={channel.id} className={value === best && data.channels.length > 1 ? 'accent' : ''}>
                      {metric.percent && value !== null ? `${format(value * 100)}%` : format(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="source-note">{data.note}</p>
    </>
  );
}

function AlertsPanel({ rows, pending, readAll, read }: { rows: CompetitorAlert[]; pending: boolean; readAll: () => void; read: (id: number) => void }) {
  return (
    <section>
      <div className="section-heading">
        <h2>Alerts</h2>
        <button className="secondary-button" type="button" disabled={pending || !rows.some(alert => !alert.read)} onClick={readAll}>
          Mark all read
        </button>
      </div>
      {!rows.length ? (
        <p className="empty-state">No alerts yet.</p>
      ) : (
        <ul className="alert-list">
          {rows.map(alert => (
            <li key={alert.id} className={alert.read ? 'muted' : ''}>
              <div>
                <span className="badge">{alert.kind.replaceAll('_', ' ')}</span>
                <p>{alert.title}</p>
                <small>{new Date(alert.created_at.endsWith('Z') ? alert.created_at : alert.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</small>
              </div>
              <div>
                {alert.payload.videoId ? (
                  <a
                    className="text-button"
                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(alert.payload.videoId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open video
                  </a>
                ) : null}
                {!alert.read ? (
                  <button className="secondary-button" type="button" disabled={pending} onClick={() => read(alert.id)}>
                    Mark read<span className="sr-only">: {alert.title}</span>
                  </button>
                ) : (
                  <span>Read</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function scoreFeed(rows: FeedVideo[], channels: CompetitorMetrics[]) {
  return rows.map(video => {
    const metric = channels.find(channel => channel.id === video.channel_id);
    const median = video.is_short ? metric?.medianViewsShorts : metric?.medianViewsLong;
    return { ...video, vpd: video.view_count / ageDays(video.published_at), outlierX: median ? video.view_count / median : null };
  });
}

function useWatchlist(ownedId: string) {
  const [tab, setTab] = useState(tabs[0]);
  const [input, setInput] = useState('');
  const client = useQueryClient();
  const comparison = useQuery({
    queryKey: ['competitors', ownedId, 'compare'],
    queryFn: ({ signal }) => getJson<CompetitorComparisonResponse>(`/competitors/${ownedId}/compare?days=30`, signal),
  });
  const feed = useQuery({
    queryKey: ['competitors', ownedId, 'feed'],
    queryFn: ({ signal }) => getJson<FeedVideo[]>(`/competitors/${ownedId}/feed?days=30`, signal),
    enabled: tab === 'Upload feed',
  });
  const alerts = useQuery({
    queryKey: ['alerts', ownedId],
    queryFn: ({ signal }) => getJson<CompetitorAlert[]>(`/alerts/${ownedId}`, signal),
    enabled: tab === 'Alerts',
  });
  const action = useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: 'POST' | 'DELETE'; body?: unknown }) => mutateJson(path, method, body),
    onSuccess: async (_data, variables) => {
      if (variables.body) setInput('');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['competitors', ownedId] }),
        client.invalidateQueries({ queryKey: ['alerts', ownedId] }),
        client.invalidateQueries({ queryKey: ['channels'] }),
        client.invalidateQueries({ queryKey: ['quota'] }),
      ]);
    },
  });
  function track(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.trim()) action.mutate({ path: `/competitors/${ownedId}`, body: { input: input.trim() } });
  }
  return { tab, setTab, input, setInput, comparison, feed, alerts, action, track };
}

function WatchlistResults({
  ownedId,
  research,
}: {
  ownedId: string;
  research: Pick<ReturnType<typeof useWatchlist>, 'tab' | 'comparison' | 'feed' | 'alerts' | 'action'>;
}) {
  const { tab, comparison, feed, alerts, action } = research;
  const query = tab === 'Comparison' ? comparison : tab === 'Upload feed' ? feed : alerts;
  return (
    <>
      {query.isPending ? <p role="status">Loading {tab.toLowerCase()}…</p> : null}
      {query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : null}
      {tab === 'Comparison' && comparison.data ? (
        <Comparison
          data={comparison.data}
          ownedId={ownedId}
          pending={action.isPending}
          untrack={id => action.mutate({ path: `/competitors/${ownedId}/${id}`, method: 'DELETE' })}
        />
      ) : null}
      {tab === 'Upload feed' && feed.data ? (
        <>
          {comparison.isError ? <QueryError error={comparison.error} retry={() => void comparison.refetch()} /> : null}
          <VideoTable rows={scoreFeed(feed.data, comparison.data?.channels || [])} />
          <p className="source-note">Newest competitor uploads in the last 30 days. Outlier × uses the same-format median of each channel's synced library.</p>
        </>
      ) : null}
      {tab === 'Alerts' && alerts.data ? (
        <AlertsPanel
          rows={alerts.data}
          pending={action.isPending}
          readAll={() => action.mutate({ path: `/alerts/${ownedId}/read-all` })}
          read={id => action.mutate({ path: `/alerts/read/${id}` })}
        />
      ) : null}
    </>
  );
}

function Watchlist({ ownedId }: { ownedId: string }) {
  const { tab, setTab, input, setInput, comparison, feed, alerts, action, track } = useWatchlist(ownedId);
  return (
    <>
      <form className="search-form" onSubmit={track}>
        <label htmlFor="competitor">Track a competitor</label>
        <div className="search-row">
          <input
            id="competitor"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="@handle, channel URL, UC id or video URL"
            required
          />
          <button type="submit" className="primary-button" disabled={action.isPending || !input.trim()}>
            Track
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={action.isPending}
            onClick={() => action.mutate({ path: `/competitors/${ownedId}/refresh` })}
          >
            Refresh all now
          </button>
        </div>
        <p className="search-hint">Tracking and refreshing use YouTube API quota to sync public data.</p>
      </form>
      {action.isError ? (
        <div role="alert" className="error-message">
          {action.error.message}
        </div>
      ) : null}
      {action.isSuccess ? (
        <p role="status" className="source-note">
          Updated.
        </p>
      ) : null}
      <Tabs labels={tabs} value={tab} onChange={setTab} />
      <WatchlistResults ownedId={ownedId} research={{ tab, comparison, feed, alerts, action }} />
    </>
  );
}
export function Competitors() {
  const channel = useOwnedChannel();
  return (
    <>
      <PageHeader
        title="Competitors"
        description="Compare public channel data. Daily snapshots build growth history; track uploads, breakouts and packaging alerts."
      />
      <ChannelSelect channel={channel} />
      {channel.channels.isPending ? (
        <p role="status">Loading channels…</p>
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.current ? (
        <Watchlist key={channel.current.id} ownedId={channel.current.id} />
      ) : (
        <p className="empty-state">Add an owned channel in the classic UI to track competitors.</p>
      )}
    </>
  );
}
