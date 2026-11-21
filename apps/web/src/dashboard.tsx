import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type {
  AnalyticsOverviewResponse,
  Channel,
  ChannelHistoryResponse,
  ChannelScoreResponse,
  ChannelSegmentsResponse,
  ChannelSyncResponse,
  ChannelVideosResponse,
  CompetitorAlert,
  IdeasResponse,
  PerformanceSegment,
  Video,
} from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { ChannelSelect, PageHeader, QueryError, StatCard, Table, useOwnedChannel } from './components/research';
import { duration, format, times, timestamp } from './components/format';
import { LineChart } from './components/line-chart';

const classicUrl = import.meta.env.DEV ? 'http://localhost:4949/' : '/';
function useDashboardQuery<T>(id: string, path: string, enabled = true) {
  return useQuery({ queryKey: ['dashboard', id, path], queryFn: ({ signal }) => getJson<T>(path, signal), enabled, retry: false });
}
function RequestState({ query }: { query: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown } }) {
  if (query.isError && query.error) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  return query.isPending ? (
    <p role="status" className="muted">
      Loading…
    </p>
  ) : null;
}
function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="dashboard-card">
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Score({ value }: { value: number }) {
  return (
    <span className={`score-ring ${value >= 70 ? 'score-good' : value >= 45 ? 'score-mid' : 'score-low'}`} aria-label={`Score ${Math.round(value)} out of 100`}>
      {Math.round(value)}
    </span>
  );
}
function percentDelta(value: number | null | undefined) {
  return value == null ? 'No previous-period comparison' : `${value >= 0 ? '▲' : '▼'} ${Math.abs(value * 100).toFixed(1)}% vs previous 28d`;
}
function VideoRows({ videos, median, caption }: { videos: Video[]; median?: number; caption: string }) {
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          <th scope="col">Video</th>
          <th scope="col">{median ? '× median' : 'Views'}</th>
        </tr>
      </thead>
      <tbody>
        {videos.map(video => (
          <tr key={video.id}>
            <td>
              <a className="video-cell" href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noreferrer">
                {video.thumbnail ? <img src={video.thumbnail} alt="" width="80" height="45" loading="lazy" /> : null}
                <span>
                  {video.title}
                  <small className="sample-note">
                    {timestamp(video.published_at)}
                    {video.duration_sec ? ` · ${duration(video.duration_sec)}` : ''}
                    {video.is_short ? ' · Short' : ''}
                  </small>
                </span>
              </a>
            </td>
            <td>{median ? times(video.view_count / median) : format(video.view_count)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
function Breakouts({ label, segment }: { label: string; segment: PerformanceSegment }) {
  const videos = segment.median > 0 ? segment.breakout.filter(video => video.view_count >= 3 * segment.median).slice(0, 6) : [];
  return (
    <div className="breakout-group">
      <h3>{label}</h3>
      {videos.length ? (
        <VideoRows videos={videos} median={segment.median} caption={`${label} breakouts`} />
      ) : (
        <p className="muted">
          No breakouts yet. Median {label} views: {format(segment.median)}.
        </p>
      )}
    </div>
  );
}
type DashboardQuery<T> = ReturnType<typeof useDashboardQuery<T>>;
function ChannelScoreCard({ score }: { score: DashboardQuery<ChannelScoreResponse | null> }) {
  return (
    <>
      {' '}
      {score.isPending || score.isError || score.data ? (
        <Card title={score.data ? `Channel score · grade ${score.data.grade}` : 'Channel score'}>
          <RequestState query={score} />
          {score.data ? (
            <>
              <div className="score-summary">
                <Score value={score.data.score} />
                <p>{score.data.advice}</p>
              </div>
              <div className="metrics">
                {Object.entries(score.data.components).map(([name, value]) => (
                  <div key={name}>
                    <label>
                      {name}
                      <progress max="100" value={value} aria-label={name} />
                    </label>
                    <span>{value} / 100</span>
                  </div>
                ))}
              </div>
              <p className="source-note">
                Weights:{' '}
                {Object.entries(score.data.weights)
                  .map(([name, weight]) => `${name} ${Math.round(weight * 100)}%`)
                  .join(' · ')}
                . Based on {score.data.sample.videos} synced videos, {score.data.sample.recent90d} in the last 90 days, {score.data.sample.snapshotDays} days of
                snapshots.
              </p>
            </>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
function IdeasCard({ ideas }: { ideas: DashboardQuery<IdeasResponse> }) {
  return (
    <>
      {' '}
      {ideas.isPending || ideas.isError || ideas.data?.length ? (
        <Card
          title="Today's top ideas"
          action={
            <a className="text-button" href={`${classicUrl}#/radar/ideas`}>
              All ideas
            </a>
          }
        >
          <RequestState query={ideas} />
          <ol className="idea-list">
            {ideas.data?.slice(0, 3).map(idea => (
              <li key={idea.id}>
                <div>
                  <strong>{idea.best_title}</strong>
                  <p className="muted">{idea.angle}</p>
                </div>
                <div>
                  {idea.score !== null ? <Score value={idea.score} /> : null}
                  {idea.predicted_x ? <small className="muted">Estimate: ~{times(idea.predicted_x)} usual</small> : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </>
  );
}
function OwnerAnalytics({ analytics, authorized }: { analytics: DashboardQuery<AnalyticsOverviewResponse>; authorized: boolean }) {
  const ov = analytics.data;
  return (
    <>
      {' '}
      {ov ? (
        <div className="metrics">
          <StatCard
            label="Watch time (hours), 28d"
            value={format((ov.totals.estimatedMinutesWatched || 0) / 60)}
            note={percentDelta(ov.delta.estimatedMinutesWatched)}
          />
          <StatCard label="Avg view duration" value={duration(ov.totals.averageViewDuration || 0)} note={percentDelta(ov.delta.averageViewDuration)} />
          <StatCard label="Avg % viewed" value={`${(ov.totals.averageViewPercentage || 0).toFixed(1)}%`} note={percentDelta(ov.delta.averageViewPercentage)} />
          <StatCard
            label="Net subscribers, 28d"
            value={format((ov.totals.subscribersGained || 0) - (ov.totals.subscribersLost || 0))}
            note={`+${format(ov.totals.subscribersGained || 0)} / −${format(ov.totals.subscribersLost || 0)}`}
          />
        </div>
      ) : authorized ? (
        <p className="muted" role="status">
          {analytics.isError ? `Owner analytics unavailable: ${analytics.error.message}` : 'Loading owner analytics…'}
        </p>
      ) : null}
    </>
  );
}
function DashboardStats({
  channel,
  history,
  library,
  segments,
  ov,
}: {
  channel: Channel;
  history: DashboardQuery<ChannelHistoryResponse>;
  library: DashboardQuery<ChannelVideosResponse>;
  segments: DashboardQuery<ChannelSegmentsResponse>;
  ov: AnalyticsOverviewResponse | undefined;
}) {
  const hist = history.data || [];
  const snapshotNote = (field: 'subs' | 'views') =>
    hist.length > 1
      ? `${hist[hist.length - 1][field] - hist[0][field] >= 0 ? '+' : ''}${format(hist[hist.length - 1][field] - hist[0][field])} over ${hist.length}d of snapshots`
      : history.isError
        ? 'Snapshot history unavailable'
        : history.isPending
          ? 'Loading snapshots…'
          : 'Snapshots build daily';
  return (
    <>
      {' '}
      <div className="metrics">
        <StatCard label="Subscribers" value={format(channel.subscriber_count)} note={snapshotNote('subs')} />
        <StatCard label="Total views" value={format(channel.view_count)} note={snapshotNote('views')} />
        <StatCard
          label="Videos"
          value={format(channel.video_count)}
          note={library.data ? `${format(library.data.total)} synced locally` : library.isError ? 'Local count unavailable' : 'Loading local count…'}
        />
        <StatCard
          label={ov ? 'Views, last 28d' : 'Long-form median views'}
          value={format(ov ? ov.totals.views : segments.data?.long.median)}
          note={
            ov
              ? percentDelta(ov.delta.views)
              : segments.data
                ? `Shorts median ${format(segments.data.shorts.median)}`
                : segments.isError
                  ? 'Medians unavailable'
                  : 'Loading medians…'
          }
        />
      </div>
    </>
  );
}
function DashboardCards({
  ov,
  history,
  alerts,
  segments,
  library,
}: {
  ov: AnalyticsOverviewResponse | undefined;
  history: DashboardQuery<ChannelHistoryResponse>;
  alerts: DashboardQuery<CompetitorAlert[]>;
  segments: DashboardQuery<ChannelSegmentsResponse>;
  library: DashboardQuery<ChannelVideosResponse>;
}) {
  return (
    <div className="dashboard-grid">
      <Card title={ov ? 'Daily views (28d, Analytics API)' : 'Subscriber snapshots (90d)'}>
        {ov ? (
          <LineChart label="Daily views" points={ov.daily.map(day => ({ day: day.day, value: day.views }))} />
        ) : (
          <>
            <RequestState query={history} />
            {history.data ? <LineChart label="Subscriber snapshots" points={(history.data || []).map(day => ({ day: day.day, value: day.subs }))} /> : null}
          </>
        )}
      </Card>
      <Card
        title="Alerts"
        action={
          <Link className="text-button" to="/competitors">
            All
          </Link>
        }
      >
        <RequestState query={alerts} />
        {alerts.data?.length ? (
          <ul className="alert-list">
            {alerts.data.slice(0, 8).map(alert => (
              <li key={alert.id}>
                <div>
                  {alert.title}
                  <small className="sample-note">{timestamp(alert.created_at)}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : alerts.data ? (
          <p className="muted">No unread alerts. Competitor uploads, breakouts and packaging changes land here after each daily snapshot.</p>
        ) : null}
      </Card>
      <Card title="Breakouts (≥ 3× same-format median)">
        <RequestState query={segments} />
        {segments.data ? (
          <>
            <Breakouts label="Long-form" segment={segments.data.long} />
            <Breakouts label="Shorts" segment={segments.data.shorts} />
          </>
        ) : null}
      </Card>
      <Card title="Latest uploads">
        <RequestState query={library} />
        {library.data?.videos.length ? (
          <VideoRows videos={library.data.videos} caption="Latest uploads" />
        ) : library.data ? (
          <p className="muted">Sync to load videos.</p>
        ) : null}
      </Card>
    </div>
  );
}
function ChannelDashboard({ channel }: { channel: Channel }) {
  const id = channel.id;
  const client = useQueryClient();
  const history = useDashboardQuery<ChannelHistoryResponse>(id, `/channels/${id}/history?days=90`);
  const segments = useDashboardQuery<ChannelSegmentsResponse>(id, `/channels/${id}/segments`);
  const alerts = useDashboardQuery<CompetitorAlert[]>(id, `/alerts/${id}?unread=1`);
  const library = useDashboardQuery<ChannelVideosResponse>(id, `/channels/${id}/videos?limit=8`);
  const score = useDashboardQuery<ChannelScoreResponse | null>(id, `/scores/channel/${id}`);
  const ideas = useDashboardQuery<IdeasResponse>(id, `/ideas/${id}?days=2`);
  const analytics = useDashboardQuery<AnalyticsOverviewResponse>(id, `/analytics/${id}/overview?days=28`, channel.authorized);
  const sync = useMutation({
    mutationFn: () => mutateJson<ChannelSyncResponse>(`/channels/${id}/sync`, 'POST', { force: true }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['channels'] }),
        client.invalidateQueries({ queryKey: ['dashboard', id] }),
        client.invalidateQueries({ queryKey: ['quota'] }),
      ]);
    },
  });
  const ov = analytics.data;
  return (
    <>
      <div className="section-heading dashboard-heading">
        <PageHeader
          title={channel.title || id}
          section="Dashboard"
          description={`${channel.handle || id} · ${channel.authorized ? 'Google-connected (full analytics)' : 'Public data only'} · Last synced ${timestamp(channel.last_synced)}`}
        />
        <div className="dashboard-actions">
          <button className="primary-button" type="button" disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </button>
          <a className="text-button" href={`${classicUrl}#/analytics`}>
            Analytics
          </a>
          <a className="text-button" href={`${classicUrl}#/coach`}>
            Ask the coach
          </a>
        </div>
      </div>
      {sync.isError ? (
        <p role="alert" className="error-message">
          {sync.error.message}
        </p>
      ) : null}
      {sync.isSuccess ? <p role="status">Synced {format(sync.data.synced)} videos.</p> : null}
      <ChannelScoreCard score={score} />
      <IdeasCard ideas={ideas} />
      <DashboardStats channel={channel} history={history} library={library} segments={segments} ov={ov} />
      <OwnerAnalytics analytics={analytics} authorized={channel.authorized} />
      <DashboardCards ov={ov} history={history} alerts={alerts} segments={segments} library={library} />
    </>
  );
}
export function Dashboard() {
  const channel = useOwnedChannel();
  return (
    <>
      <ChannelSelect channel={channel} />
      {channel.channels.isPending ? (
        <p role="status">Loading channels…</p>
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.current ? (
        <ChannelDashboard key={channel.current.id} channel={channel.current} />
      ) : (
        <>
          <PageHeader title="Dashboard" description="Your channel at a glance." />
          <p className="empty-state">
            Add an owned channel in the{' '}
            <a className="text-button" href={`${classicUrl}#/channels`}>
              classic UI
            </a>{' '}
            to view your dashboard.
          </p>
        </>
      )}
    </>
  );
}
