import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { SearchX } from 'lucide-react';
import { ageDays, format } from './components/format';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompetitorComparisonResponse, CompetitorMetrics, CompetitorAlert, FeedVideo } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { ChannelSelect, PageHeader, QueryError, StatCard, StatGrid, Table, Tabs, useOwnedChannel } from './components/research';
import { VideoTable } from './components/video-table';

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
      <StatGrid>
        <StatCard label="Tracked competitors" value={data.channels.filter(channel => channel.id !== ownedId).length} note="Public channel data" />
      </StatGrid>
      {data.channels.length < 2 ? <p className="text-sm text-muted-foreground">Track a competitor to compare with your channel.</p> : null}
      <Table caption="Channel metrics comparison">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {data.channels.map(channel => (
              <th key={channel.id} scope="col">
                <div className="flex flex-col items-start gap-2">
                  <span className="flex items-center gap-2">
                    {channel.thumbnail ? <img className="size-8 rounded-full object-cover" src={channel.thumbnail} alt="" width="32" height="32" /> : null}
                    {channel.title}
                  </span>
                  {channel.id === ownedId ? (
                    <Badge variant="secondary">You</Badge>
                  ) : (
                    <Button type="button" variant="link" disabled={pending} onClick={() => untrack(channel.id)}>
                      Untrack<span className="sr-only"> {channel.title}</span>
                    </Button>
                  )}
                </div>
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
                    <td key={channel.id} className={cn('num', value === best && data.channels.length > 1 && 'font-semibold text-primary')}>
                      {metric.percent && value !== null ? `${format(value * 100)}%` : format(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Alert>
        <AlertDescription>{data.note}</AlertDescription>
      </Alert>
    </>
  );
}

function AlertsPanel({ rows, pending, readAll, read }: { rows: CompetitorAlert[]; pending: boolean; readAll: () => void; read: (id: number) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
        <CardAction>
          <Button variant="outline" type="button" disabled={pending || !rows.some(alert => !alert.read)} onClick={readAll}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Mark all read
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!rows.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>No results yet</EmptyTitle>
              <EmptyDescription>No alerts yet.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map(alert => (
              <li
                key={alert.id}
                className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4', alert.read && 'text-muted-foreground')}
              >
                <div className="flex flex-col gap-2">
                  <Badge variant="outline">{alert.kind.replaceAll('_', ' ')}</Badge>
                  <p>{alert.title}</p>
                  <small>{new Date(alert.created_at.endsWith('Z') ? alert.created_at : alert.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</small>
                </div>
                <div className="flex items-center gap-2">
                  {alert.payload.videoId ? (
                    <Button asChild variant="link">
                      <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(alert.payload.videoId)}`} target="_blank" rel="noreferrer">
                        Open video
                      </a>
                    </Button>
                  ) : null}
                  {!alert.read ? (
                    <Button variant="outline" type="button" disabled={pending} onClick={() => read(alert.id)}>
                      Mark read<span className="sr-only">: {alert.title}</span>
                    </Button>
                  ) : (
                    <span>Read</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
      toast.success('Updated.');
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
      {query.isPending ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Loading {tab.toLowerCase()}…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
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
          <p className="text-sm text-muted-foreground">
            Newest competitor uploads in the last 30 days. Outlier × uses the same-format median of each channel's synced library.
          </p>
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
      <form className="flex flex-col gap-3" onSubmit={track}>
        <FieldGroup className="flex-row flex-wrap items-end gap-3">
          <div className="flex w-full flex-wrap items-end gap-3">
            <Field className="w-auto flex-1">
              <FieldLabel htmlFor="competitor">Track a competitor</FieldLabel>
              <Input
                id="competitor"
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="@handle, channel URL, UC id or video URL"
                required
              />
            </Field>
            <Button type="submit" disabled={action.isPending || !input.trim()}>
              {action.isPending && !action.variables?.path.endsWith('/refresh') ? <Spinner data-icon="inline-start" /> : null}
              Track
            </Button>
            <Button type="button" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ path: `/competitors/${ownedId}/refresh` })}>
              {action.isPending && action.variables?.path.endsWith('/refresh') ? <Spinner data-icon="inline-start" /> : null}
              Refresh all now
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Tracking and refreshing use YouTube API quota to sync public data.</p>
        </FieldGroup>
      </form>
      {action.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{action.error.message}</AlertDescription>
        </Alert>
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
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Loading channels…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.current ? (
        <Watchlist key={channel.current.id} ownedId={channel.current.id} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No results yet</EmptyTitle>
            <EmptyDescription>Add an owned channel in the classic UI to track competitors.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
