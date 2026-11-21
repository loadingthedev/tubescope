import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { OutlierMark } from './components/outlier-mark';
import { Spinner } from '@/components/ui/spinner';
import { SearchX } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SaveToBoard } from './components/save-to-board';
import { CopyText, DataSection } from './components/data-section';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';

const videoRoute = getRouteApi('/library/$videoId');
import type {
  ChannelSyncResponse,
  ChannelVideosResponse,
  VideoChecklistResponse,
  VideoDetailResponse,
  AgeComparisonResponse,
  VideoScoresResponse,
  ChannelSegmentsResponse,
} from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { ChannelSelect, PageHeader, QueryError, StatCard, StatGrid, Table, Tabs, useOwnedChannel } from './components/research';
import { LineChart } from './components/line-chart';
import { duration, format, timestamp } from './components/format';

function Checklist({ id }: { id: string }) {
  const checks = useQuery({
    queryKey: ['video-checklist', id],
    queryFn: ({ signal }) => getJson<VideoChecklistResponse | null>(`/videos/${encodeURIComponent(id)}/checklist`, signal),
  });
  if (checks.isError) return <QueryError error={checks.error} retry={() => void checks.refetch()} />;
  if (checks.isPending)
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Loading checklist…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (!checks.data) return <p>No checklist available. Sync this video first.</p>;
  const data = checks.data;
  const sections = [
    { title: 'Publishing checklist', score: data.score, rows: data.items.map(check => ({ ...check, name: check.item })) },
    { title: 'Title checks', score: data.title.score, rows: data.title.checks },
    { title: 'Description checks', score: data.description.score, rows: data.description.checks },
  ];
  return (
    <>
      <p className="text-sm text-muted-foreground">{data.title.note}</p>
      {sections.map(section => (
        <section key={section.title} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">
            {section.title} · {format(section.score)}/100
          </h3>
          {!section.rows.length ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>No checks returned.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {section.rows.map(check => (
                <li key={check.name}>
                  <strong>
                    {check.pass ? 'Pass' : 'Check'}: {check.name}
                  </strong>
                  <p className="text-sm text-muted-foreground">{check.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
function AgeComparison({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['age-comparison', id],
    queryFn: ({ signal }) => getJson<AgeComparisonResponse | null>(`/videos/${encodeURIComponent(id)}/age-comparison`, signal),
  });
  return (
    <DataSection query={query}>
      {d =>
        !d ? (
          <p>No comparison available.</p>
        ) : (
          <>
            <h2 className="text-xl font-semibold">Same-age comparison (est.)</h2>
            <p>
              Age: {format(d.ageDays)} days · views: {format(d.viewsNow)} · peer median (est.): {format(d.peerMedianAtSameAge)} ·{' '}
              <OutlierMark value={d.index} />
            </p>
            <p>{d.note}</p>
            {!d.peers.length ? (
              <Empty className="border bg-card">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchX />
                  </EmptyMedia>
                  <EmptyTitle>No results</EmptyTitle>
                  <EmptyDescription>No same-format peers yet.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table caption="Same-age peers">
                <thead>
                  <tr>
                    <th scope="col">Peer</th>
                    <th scope="col">Views at age</th>
                  </tr>
                </thead>
                <tbody>
                  {d.peers.map(p => (
                    <tr key={p.id}>
                      <th scope="row">{p.title}</th>
                      <td>
                        {format(p.viewsAtAge)}
                        {p.estimated ? ' (est.)' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )
      }
    </DataSection>
  );
}
export function VideoDetail() {
  const { videoId } = videoRoute.useParams();
  const [tab, setTab] = useState('Overview');
  const channel = useOwnedChannel();
  const video = useQuery({
    queryKey: ['video', videoId],
    queryFn: ({ signal }) => getJson<VideoDetailResponse>(`/videos/${encodeURIComponent(videoId)}`, signal),
  });
  if (video.isError)
    return (
      <>
        <Link to="/library">← Video library</Link>
        <QueryError error={video.error} retry={() => void video.refetch()} />
      </>
    );
  if (video.isPending)
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Loading video…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  const data = video.data;
  const owned = channel.owned.some(item => item.id === data.channel_id);
  return (
    <>
      <Link to="/library">← Video library</Link>
      <PageHeader
        title={data.title}
        description={`${data.channel_title || ''} · ${timestamp(data.published_at)} · ${duration(data.duration_sec)} · ${data.is_short ? 'Shorts' : data.is_live ? 'Live' : 'Long-form'} · ${data.format}`}
      />
      <p>
        <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`} target="_blank" rel="noreferrer">
          Open on YouTube ↗
        </a>
      </p>
      <CopyText text={data.title} label="Copy title" />
      <SaveToBoard video={data} />
      <StatGrid>
        <StatCard label="Views" value={format(data.view_count)} note="Latest synced count" />
        <StatCard label="Likes" value={format(data.like_count)} note="Latest synced count" />
        <StatCard label="Comments" value={format(data.comment_count)} note="Latest synced count" />
      </StatGrid>
      <Tabs labels={owned ? ['Overview', 'Checklist', 'History', 'Age comparison'] : ['Overview', 'History', 'Age comparison']} value={tab} onChange={setTab} />
      <Card>
        <CardHeader>
          <CardTitle>{tab}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tab === 'Overview' ? (
            <>
              <h2 className="text-xl font-semibold">Description</h2>
              <p className="whitespace-pre-wrap text-sm">{data.description || 'No description.'}</p>
              <h2 className="text-xl font-semibold">Tags ({format(data.tags.length)})</h2>
              <p>{data.tags.join(', ') || 'No tags.'}</p>
            </>
          ) : tab === 'Age comparison' ? (
            <AgeComparison id={data.id} />
          ) : tab === 'Checklist' && owned ? (
            <Checklist id={data.id} />
          ) : (
            <>
              <h2 className="text-xl font-semibold">Daily view snapshots</h2>
              <LineChart label="Video view history" points={data.history.map(point => ({ day: point.day, value: point.views }))} />
              <h2 className="text-xl font-semibold">Observed metadata changes</h2>
              {!data.metadataHistory.length ? (
                <p className="text-sm text-muted-foreground">No metadata changes observed yet.</p>
              ) : (
                <Table caption="Observed metadata history">
                  <thead>
                    <tr>
                      {['When', 'Field', 'From', 'To'].map(label => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.metadataHistory.map(item => (
                      <tr key={item.id}>
                        <td>{timestamp(item.observed_at)}</td>
                        <th scope="row">{item.field}</th>
                        <td className="max-w-80 whitespace-pre-wrap break-words">{item.old_value || '—'}</td>
                        <td className="max-w-80 whitespace-pre-wrap break-words">{item.new_value || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
export function Library() {
  const channel = useOwnedChannel();
  const [filters, setFilters] = useState(() => {
    const defaults = { q: '', format: 'all', sort: 'published_at', dir: 'desc', from: '', to: '' };
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('tubescope:library-filters:v1') || 'null');
      if (saved && typeof saved === 'object')
        for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
          if (key in saved && typeof (saved as Record<string, unknown>)[key] === 'string') defaults[key] = (saved as Record<string, string>)[key];
        }
    } catch {
      /* Storage is optional. */
    }
    return defaults;
  });
  const [page, setPage] = useState({ key: '', offset: 0 });
  const id = channel.current?.id || '';
  const client = useQueryClient();
  const sync = useMutation({
    mutationFn: () => mutateJson<ChannelSyncResponse>(`/channels/${encodeURIComponent(id)}/sync`, 'POST', { force: true }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['library', id] }),
        client.invalidateQueries({ queryKey: ['library-scores', id] }),
        client.invalidateQueries({ queryKey: ['library-segments', id] }),
        client.invalidateQueries({ queryKey: ['channels'] }),
        client.invalidateQueries({ queryKey: ['quota'] }),
      ]);
    },
  });
  const key = JSON.stringify([id, filters]);
  const offset = page.key === key ? page.offset : 0;
  const params = new URLSearchParams({ ...filters, limit: '50', offset: String(offset) });
  const videos = useQuery({
    queryKey: ['library', id, filters, offset],
    queryFn: ({ signal }) => getJson<ChannelVideosResponse>(`/channels/${encodeURIComponent(id)}/videos?${params}`, signal),
    enabled: Boolean(id),
  });
  const scores = useQuery({
    queryKey: ['library-scores', id],
    queryFn: ({ signal }) => getJson<VideoScoresResponse>(`/scores/channel/${id}/videos`, signal),
    enabled: Boolean(id),
  });
  const segments = useQuery({
    queryKey: ['library-segments', id],
    queryFn: ({ signal }) => getJson<ChannelSegmentsResponse>(`/channels/${id}/segments`, signal),
    enabled: Boolean(id),
  });
  function filter(name: keyof typeof filters, value: string) {
    const next = { ...filters, [name]: value };
    setFilters(next);
    try {
      localStorage.setItem('tubescope:library-filters:v1', JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
  }
  return (
    <>
      <PageHeader title="Video library" description="Search synced videos. Inspect stats, view history and non-AI packaging checks." />
      {channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.channels.isPending ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Loading channels…</span>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !id ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No owned channels</EmptyTitle>
            <EmptyDescription>
              No owned channels yet. <Link to="/channels">Add a channel</Link> to load its library.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ChannelSelect channel={channel} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/channels/${encodeURIComponent(id)}/export/videos.csv`}>Export CSV</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/channels/${encodeURIComponent(id)}/backup`}>Backup JSON</a>
            </Button>
            <Button type="button" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? <Spinner data-icon="inline-start" /> : null}
              {sync.isPending ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
          {sync.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{sync.error.message}</AlertDescription>
            </Alert>
          ) : sync.data ? (
            <p role="status">Synced {format(sync.data.synced)} videos.</p>
          ) : null}
          <FieldGroup className="flex-row flex-wrap items-end gap-3">
            <Field className="w-auto">
              <FieldLabel htmlFor="library-field-1">Search</FieldLabel>
              <Input
                id="library-field-1"
                type="search"
                value={filters.q}
                onChange={event => filter('q', event.target.value)}
                placeholder="Title or description"
              />
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="library-field-2">Format</FieldLabel>
              <ToggleGroup
                id="library-field-2"
                aria-label="Format"
                type="single"
                variant="outline"
                value={filters.format}
                onValueChange={value => {
                  if (value) filter('format', value);
                }}
              >
                <ToggleGroupItem value="all">All formats</ToggleGroupItem>
                <ToggleGroupItem value="long">Long-form</ToggleGroupItem>
                <ToggleGroupItem value="shorts">Shorts</ToggleGroupItem>
                <ToggleGroupItem value="live">Live</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="library-field-3">Sort</FieldLabel>
              <Select value={filters.sort} onValueChange={value => filter('sort', value)}>
                <SelectTrigger id="library-field-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[
                      ['published_at', 'Published'],
                      ['view_count', 'Views'],
                      ['like_count', 'Likes'],
                      ['comment_count', 'Comments'],
                      ['duration_sec', 'Duration'],
                      ['title', 'Title'],
                    ].map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="library-field-4">Direction</FieldLabel>
              <ToggleGroup
                id="library-field-4"
                aria-label="Direction"
                type="single"
                variant="outline"
                value={filters.dir}
                onValueChange={value => {
                  if (value) filter('dir', value);
                }}
              >
                <ToggleGroupItem value="desc">Descending</ToggleGroupItem>
                <ToggleGroupItem value="asc">Ascending</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="library-field-5">From</FieldLabel>
              <Input id="library-field-5" type="date" value={filters.from} onChange={event => filter('from', event.target.value)} />
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="library-field-6">To</FieldLabel>
              <Input id="library-field-6" type="date" value={filters.to} min={filters.from} onChange={event => filter('to', event.target.value)} />
            </Field>
          </FieldGroup>
          {videos.isError ? (
            <QueryError error={videos.error} retry={() => void videos.refetch()} />
          ) : videos.isPending ? (
            <div role="status" className="flex flex-col gap-2">
              <span className="sr-only">Loading videos…</span>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <p>{format(videos.data.total)} matching videos</p>
              {scores.isError ? <QueryError error={scores.error} retry={() => void scores.refetch()} /> : null}
              {segments.isError ? <QueryError error={segments.error} retry={() => void segments.refetch()} /> : null}
              {!videos.data.videos.length ? (
                <Empty className="border bg-card">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SearchX />
                    </EmptyMedia>
                    <EmptyTitle>No results</EmptyTitle>
                    <EmptyDescription>No matching videos. Adjust the filters or sync this channel in Channels.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table caption="Synced video library">
                  <thead>
                    <tr>
                      {['Video', 'Published', 'Format', 'Duration', 'Views', 'Likes', 'Comments', 'Score', '× format median', 'Tags'].map(label => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {videos.data.videos.map(video => (
                      <tr key={video.id}>
                        <th scope="row" className="max-w-[26rem] min-w-72">
                          <Link
                            className="flex items-start gap-3 leading-snug font-medium hover:text-primary"
                            to="/library/$videoId"
                            params={{ videoId: video.id }}
                          >
                            {video.thumbnail ? (
                              <img
                                src={video.thumbnail}
                                alt=""
                                width="96"
                                height="54"
                                className="aspect-video w-20 shrink-0 rounded-md object-cover ring-1 ring-border"
                                loading="lazy"
                              />
                            ) : null}
                            {video.title}
                          </Link>
                        </th>
                        <td>{timestamp(video.published_at)}</td>
                        <td>{video.is_short ? 'Shorts' : video.is_live ? 'Live' : 'Long-form'}</td>
                        <td>{duration(video.duration_sec)}</td>
                        <td className="num">{format(video.view_count)}</td>
                        <td className="num">{format(video.like_count)}</td>
                        <td className="num">{format(video.comment_count)}</td>
                        <td>{scores.isPending ? 'Loading…' : format(scores.data?.[video.id]?.score)}</td>
                        <td>
                          {segments.isPending ? (
                            'Loading…'
                          ) : video.is_live ? (
                            '—'
                          ) : (
                            <OutlierMark
                              value={
                                segments.data && segments.data[video.is_short ? 'shorts' : 'long'].median
                                  ? video.view_count / segments.data[video.is_short ? 'shorts' : 'long'].median
                                  : null
                              }
                            />
                          )}
                        </td>
                        <td className="max-w-56 truncate text-left text-muted-foreground" title={video.tags.join(', ')}>
                          {video.tags.join(', ') || 'No tags'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <div className="flex flex-wrap items-center gap-3" aria-label="Library pagination">
                <Button type="button" variant="outline" disabled={offset === 0} onClick={() => setPage({ key, offset: Math.max(0, offset - 50) })}>
                  Previous
                </Button>
                <span className="num text-sm text-muted-foreground">
                  Page {format(offset / 50 + 1)} of {format(Math.max(1, Math.ceil(videos.data.total / 50)))}
                </span>
                <Button type="button" variant="outline" disabled={offset + 50 >= videos.data.total} onClick={() => setPage({ key, offset: offset + 50 })}>
                  Next
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
