import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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
import { ChartLine, RefreshCw, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { classicUrl } from './app';
import { getJson, mutateJson } from './api';
import { ChannelSelect, PageHeader, QueryError, StatCard, StatGrid, Table, useOwnedChannel } from './components/research';
import { duration, format, times, timestamp } from './components/format';
import { LineChart } from './components/line-chart';
import { OutlierMark } from './components/outlier-mark';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

function useDashboardQuery<T>(id: string, path: string, enabled = true) {
  return useQuery({ queryKey: ['dashboard', id, path], queryFn: ({ signal }) => getJson<T>(path, signal), enabled, retry: false });
}
function RequestState({ query }: { query: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown } }) {
  if (query.isError && query.error) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  return query.isPending ? (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  ) : null;
}
function Panel({ title, action, className, children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
function Score({ value, size = 44 }: { value: number; size?: number }) {
  const r = 18;
  const tone = value >= 70 ? 'stroke-chart-3' : value >= 45 ? 'stroke-chart-1' : 'stroke-chart-4';
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-label={`Score ${Math.round(value)} out of 100`}
      role="img"
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={tone}
          pathLength={100}
          strokeDasharray={`${Math.max(0, Math.min(100, value))} 100`}
        />
      </svg>
      <span className="num text-xs font-medium" aria-hidden="true">
        {Math.round(value)}
      </span>
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
          <th scope="col" className="text-right">
            {median ? '× median' : 'Views'}
          </th>
        </tr>
      </thead>
      <tbody>
        {videos.map(video => (
          <tr key={video.id}>
            <td>
              <div className="flex items-center gap-3">
                {video.thumbnail ? (
                  <img
                    src={video.thumbnail}
                    alt=""
                    width="80"
                    height="45"
                    loading="lazy"
                    className="aspect-video w-20 shrink-0 rounded-md object-cover ring-1 ring-border"
                  />
                ) : null}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <a
                    className="line-clamp-2 leading-snug font-medium"
                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {video.title}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {timestamp(video.published_at)}
                    {video.duration_sec ? ` · ${duration(video.duration_sec)}` : ''}
                    {video.is_short ? ' · Short' : ''}
                  </span>
                </div>
              </div>
            </td>
            <td className="text-right">
              {median ? <OutlierMark value={video.view_count / median} /> : <span className="num">{format(video.view_count)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
function Breakouts({ label, segment }: { label: string; segment: PerformanceSegment }) {
  const videos = segment.median > 0 ? segment.breakout.filter(video => video.view_count >= 3 * segment.median).slice(0, 6) : [];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="eyebrow">{label}</h3>
      {videos.length ? (
        <VideoRows videos={videos} median={segment.median} caption={`${label} breakouts`} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No breakouts yet. Median {label} views: <span className="num">{format(segment.median)}</span>.
        </p>
      )}
    </section>
  );
}
type DashboardQuery<T> = ReturnType<typeof useDashboardQuery<T>>;
function ChannelScoreCard({ score }: { score: DashboardQuery<ChannelScoreResponse | null> }) {
  if (!score.isPending && !score.isError && !score.data) return null;
  return (
    <Panel title={score.data ? `Channel score · grade ${score.data.grade}` : 'Channel score'}>
      <RequestState query={score} />
      {score.data ? (
        <>
          <div className="flex items-center gap-4">
            <Score value={score.data.score} size={64} />
            <p className="max-w-prose text-pretty">{score.data.advice}</p>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {Object.entries(score.data.components).map(([name, value]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="capitalize">{name}</span>
                  <span className="num text-xs text-muted-foreground">{value} / 100</span>
                </div>
                <Progress value={value} aria-label={name} className="h-1.5" />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Weights:{' '}
            {Object.entries(score.data.weights)
              .map(([name, weight]) => `${name} ${Math.round(weight * 100)}%`)
              .join(' · ')}
            . Based on {score.data.sample.videos} synced videos, {score.data.sample.recent90d} in the last 90 days, {score.data.sample.snapshotDays} days of
            snapshots.
          </p>
        </>
      ) : null}
    </Panel>
  );
}
function IdeasCard({ ideas }: { ideas: DashboardQuery<IdeasResponse> }) {
  if (!ideas.isPending && !ideas.isError && !ideas.data?.length) return null;
  return (
    <Panel
      title="Today's top ideas"
      action={
        <Button asChild variant="link" size="sm">
          <a href={`${classicUrl}#/radar/ideas`}>All ideas</a>
        </Button>
      }
    >
      <RequestState query={ideas} />
      <ol className="flex flex-col divide-y">
        {ideas.data?.slice(0, 3).map(idea => (
          <li key={idea.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong className="leading-snug font-medium">{idea.best_title}</strong>
              <p className="text-sm text-muted-foreground">{idea.angle}</p>
              {idea.predicted_x ? <small className="text-xs text-muted-foreground">Estimate: ~{times(idea.predicted_x)} usual</small> : null}
            </div>
            {idea.score !== null ? <Score value={idea.score} /> : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
function OwnerAnalytics({ analytics, authorized }: { analytics: DashboardQuery<AnalyticsOverviewResponse>; authorized: boolean }) {
  const ov = analytics.data;
  if (ov)
    return (
      <StatGrid>
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
      </StatGrid>
    );
  if (!authorized) return null;
  return analytics.isError ? (
    <QueryError error={analytics.error} retry={() => void analytics.refetch()} />
  ) : (
    <div role="status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <span className="sr-only">Loading owner analytics…</span>
      {[0, 1, 2, 3].map(i => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
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
    <StatGrid>
      <StatCard label="Subscribers" value={format(channel.subscriber_count)} note={snapshotNote('subs')} accent />
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
    </StatGrid>
  );
}
function DashboardCards({
  ov,
  history,
  alerts,
  segments,
  library,
  main,
  side,
}: {
  ov: AnalyticsOverviewResponse | undefined;
  history: DashboardQuery<ChannelHistoryResponse>;
  alerts: DashboardQuery<CompetitorAlert[]>;
  segments: DashboardQuery<ChannelSegmentsResponse>;
  library: DashboardQuery<ChannelVideosResponse>;
  main: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <Panel title={ov ? 'Daily views · 28 days' : 'Subscribers · 90 days of snapshots'}>
          {ov ? (
            <LineChart label="Daily views" points={ov.daily.map(day => ({ day: day.day, value: day.views }))} />
          ) : (
            <>
              <RequestState query={history} />
              {history.data ? <LineChart label="Subscriber snapshots" points={history.data.map(day => ({ day: day.day, value: day.subs }))} /> : null}
            </>
          )}
        </Panel>
        <Panel title="Breakouts · 3× the same-format median or more">
          <RequestState query={segments} />
          {segments.data ? (
            <>
              <Breakouts label="Long-form" segment={segments.data.long} />
              <Breakouts label="Shorts" segment={segments.data.shorts} />
            </>
          ) : null}
        </Panel>
        {main}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Panel
          title="Alerts"
          action={
            <Button asChild variant="link" size="sm">
              <Link to="/competitors">All</Link>
            </Button>
          }
        >
          <RequestState query={alerts} />
          {alerts.data?.length ? (
            <ul className="flex flex-col divide-y">
              {alerts.data.slice(0, 8).map(alert => (
                <li key={alert.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-sm leading-snug">{alert.title}</span>
                  <span className="num text-xs text-muted-foreground">{timestamp(alert.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : alerts.data ? (
            <p className="text-sm text-muted-foreground">
              No unread alerts. Competitor uploads, breakouts and packaging changes land here after each daily snapshot.
            </p>
          ) : null}
        </Panel>
        <Panel title="Latest uploads">
          <RequestState query={library} />
          {library.data?.videos.length ? (
            <VideoRows videos={library.data.videos} caption="Latest uploads" />
          ) : library.data ? (
            <p className="text-sm text-muted-foreground">Sync to load videos.</p>
          ) : null}
        </Panel>
        {side}
      </div>
    </div>
  );
}
function ChannelDashboard({ channel, picker }: { channel: Channel; picker: ReactNode }) {
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
    onSuccess: async data => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['channels'] }),
        client.invalidateQueries({ queryKey: ['dashboard', id] }),
        client.invalidateQueries({ queryKey: ['quota'] }),
      ]);
      toast.success(`Synced ${format(data.synced)} videos`);
    },
    onError: error => toast.error(`Sync failed: ${error.message}`),
  });
  const ov = analytics.data;
  return (
    <>
      <PageHeader
        title={channel.title || id}
        description={`${channel.handle || id} · ${channel.authorized ? 'Google-connected, full analytics' : 'Public data only'} · Last synced ${timestamp(channel.last_synced)}`}
        actions={
          <>
            {picker}
            <Button variant="outline" asChild>
              <Link to="/analytics">
                <ChartLine data-icon="inline-start" />
                Analytics
              </Link>
            </Button>
            <Button disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              {sync.isPending ? 'Syncing…' : 'Sync now'}
            </Button>
          </>
        }
      />
      <DashboardStats channel={channel} history={history} library={library} segments={segments} ov={ov} />
      <OwnerAnalytics analytics={analytics} authorized={channel.authorized} />
      <DashboardCards
        ov={ov}
        history={history}
        alerts={alerts}
        segments={segments}
        library={library}
        main={<ChannelScoreCard score={score} />}
        side={<IdeasCard ideas={ideas} />}
      />
    </>
  );
}
export function Dashboard() {
  const channel = useOwnedChannel();
  if (channel.channels.isPending)
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading channels…</span>
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  if (channel.channels.isError) return <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />;
  if (!channel.current)
    return (
      <>
        <PageHeader title="Dashboard" description="Your channel at a glance." />
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Tv />
            </EmptyMedia>
            <EmptyTitle>No channel of yours yet</EmptyTitle>
            <EmptyDescription>Add the channel you run and the dashboard fills in after the first sync.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/channels">Add a channel</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </>
    );
  return <ChannelDashboard key={channel.current.id} channel={channel.current} picker={channel.owned.length > 1 ? <ChannelSelect channel={channel} /> : null} />;
}
