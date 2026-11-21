import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { OutlierMark } from './components/outlier-mark';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { SearchX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  IndexResponse,
  IndexStatsResponse,
  IndexCrawlResponse,
  IndexQueryResponse,
  NichesResponse,
  FormulasResponse,
  SimilarThumbnailsResponse,
} from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, StatCard, StatGrid, Table, Tabs } from './components/research';
import { format, timestamp } from './components/format';

function FilterChoice({ id, name, initial, options }: { id: string; name: string; initial: string; options: [string, string][] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Input type="hidden" name={name} value={value} />
      <ToggleGroup
        id={id}
        aria-labelledby={`${id}-label`}
        type="single"
        variant="outline"
        value={value}
        onValueChange={next => {
          if (next) setValue(next);
        }}
        className="flex-wrap"
      >
        {options.map(([key, label]) => (
          <ToggleGroupItem key={key} value={key}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}

function IndexStats() {
  const client = useQueryClient();
  const [seed, setSeed] = useState('');
  const stats = useQuery({ queryKey: ['index', 'stats'], queryFn: ({ signal }) => getJson<IndexStatsResponse>('/index/stats', signal) });
  const add = useMutation({
    mutationFn: () => mutateJson<IndexQueryResponse>('/index/queries', 'POST', { query: seed.trim() }),
    onSuccess: () => {
      setSeed('');
      void client.invalidateQueries({ queryKey: ['index'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Index & seed queries</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {stats.isPending ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Loading index stats…</span>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : stats.isError ? (
          <QueryError error={stats.error} retry={() => void stats.refetch()} />
        ) : (
          <>
            <StatGrid>
              <StatCard label="Videos" value={format(stats.data.videos)} note={`${format(stats.data.channels)} channels`} />
              <StatCard label="Outliers (3×+)" value={format(stats.data.outliers)} note={`${format(stats.data.thumbs)} thumbnails`} />
            </StatGrid>
            <p className="text-sm text-muted-foreground">Last grown: {timestamp(stats.data.last?.at || null)}</p>
            <Table caption="Seed queries">
              <thead>
                <tr>
                  <th scope="col">Query</th>
                  <th scope="col">Source</th>
                  <th scope="col">Runs</th>
                  <th scope="col">Last run</th>
                </tr>
              </thead>
              <tbody>
                {stats.data.queries.map(q => (
                  <tr key={q.query}>
                    <td>{q.query}</td>
                    <td>{q.source}</td>
                    <td className="num">{format(q.runs)}</td>
                    <td>{timestamp(q.last_run)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!stats.data.queries.length ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchX />
                  </EmptyMedia>
                  <EmptyTitle>No results yet</EmptyTitle>
                  <EmptyDescription>No seed queries yet.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </>
        )}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={e => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <FieldGroup className="flex-row flex-wrap items-end gap-3">
            <Field className="w-auto">
              <FieldLabel id="outlier-index-filter-1-label" htmlFor="outlier-index-filter-1">
                Seed query
              </FieldLabel>
              <Input id="outlier-index-filter-1" value={seed} onChange={e => setSeed(e.target.value)} required minLength={3} />
            </Field>
            <Button type="submit" variant="outline" disabled={add.isPending || seed.trim().length < 3}>
              {add.isPending ? <Spinner data-icon="inline-start" /> : null}
              Add query
            </Button>
          </FieldGroup>
        </form>
        {add.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{add.error.message}</AlertDescription>
            <Button variant="outline" size="sm" onClick={() => add.mutate()}>
              Try again
            </Button>
          </Alert>
        ) : null}
        {add.data ? <p role="status">{add.data.note}</p> : null}
        <Alert>
          <AlertDescription>Adding a query is local. It runs on the next crawl. Query removal is unavailable: the API has no delete route.</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function ThumbnailSearch() {
  const client = useQueryClient();
  const [video, setVideo] = useState('');
  const [file, setFile] = useState('');
  const match = useMutation({
    mutationFn: () => {
      const videoId = video.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] || video.trim();
      return file.trim()
        ? mutateJson<SimilarThumbnailsResponse>('/thumbnails/similar', 'POST', { file: file.trim() })
        : getJson<SimilarThumbnailsResponse>(`/thumbnails/similar?${new URLSearchParams({ videoId })}`);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['index', 'stats'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Similar thumbnails</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={e => {
            e.preventDefault();
            match.mutate();
          }}
        >
          <FieldGroup className="flex-row flex-wrap items-end gap-3">
            <Field className="w-auto">
              <FieldLabel id="outlier-index-filter-2-label" htmlFor="outlier-index-filter-2">
                Video ID or YouTube URL
              </FieldLabel>
              <Input id="outlier-index-filter-2" value={video} onChange={e => setVideo(e.target.value)} />
            </Field>
            <Field className="w-auto">
              <FieldLabel id="outlier-index-filter-3-label" htmlFor="outlier-index-filter-3">
                Or local image path
              </FieldLabel>
              <Input id="outlier-index-filter-3" value={file} onChange={e => setFile(e.target.value)} placeholder="/Users/…/thumb.jpg" />
            </Field>
            <Button type="submit" disabled={match.isPending || (!video.trim() && !file.trim())}>
              {match.isPending ? <Spinner data-icon="inline-start" /> : null}
              Find similar
            </Button>
          </FieldGroup>
        </form>
        {match.isPending ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Comparing thumbnails…</span>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}
        {match.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{match.error.message}</AlertDescription>
            <Button variant="outline" size="sm" onClick={() => match.mutate()}>
              Try again
            </Button>
          </Alert>
        ) : null}
        {match.data ? (
          <>
            <p>
              Compared with {format(match.data.compared)} thumbnails. {match.data.note}
            </p>
            {match.data.results.length ? (
              <Table caption="Similar thumbnails">
                <thead>
                  <tr>
                    {['Video', 'Channel', 'Views', '×', 'Match'].map(c => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {match.data.results.map(v => (
                    <tr key={v.videoId}>
                      <td>
                        <a
                          className="flex items-start gap-3 font-medium"
                          href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            className="aspect-video w-20 shrink-0 rounded-md object-cover ring-1 ring-border"
                            src={v.thumbnail}
                            alt=""
                            width="96"
                            height="54"
                          />
                          <span className="line-clamp-2 font-medium">{v.title || v.videoId}</span>
                        </a>
                      </td>
                      <td>{v.channel}</td>
                      <td className="num">{format(v.views)}</td>
                      <td>
                        <OutlierMark value={v.x} />
                      </td>
                      <td className="num">{format(v.similarity * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchX />
                  </EmptyMedia>
                  <EmptyTitle>No results yet</EmptyTitle>
                  <EmptyDescription>No close matches yet.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Choose a video or local image. Matching uses image data; no AI.</p>
        )}
      </CardContent>
    </Card>
  );
}

function IndexResults({ tab, params }: { tab: string; params: string }) {
  const rows = useQuery({
    queryKey: ['index', 'search', params],
    queryFn: ({ signal }) => getJson<IndexResponse>(`/index?${params}`, signal),
    enabled: tab === 'Outliers',
  });
  const niches = useQuery({
    queryKey: ['index', 'niches', params],
    queryFn: ({ signal }) => getJson<NichesResponse>(`/niches?${params}`, signal),
    enabled: tab === 'Niche finder',
  });
  const formulas = useQuery({
    queryKey: ['index', 'formulas', params],
    queryFn: ({ signal }) => getJson<FormulasResponse>(`/formulas?${params}`, signal),
    enabled: tab === 'Title formulas',
  });
  if (tab === 'Niche finder')
    return niches.isPending ? (
      <div role="status" className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">Loading niches…</span>
        <Skeleton className="h-16 w-full" />
      </div>
    ) : niches.isError ? (
      <QueryError error={niches.error} retry={() => void niches.refetch()} />
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>Niche finder</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {niches.data.niches.length ? (
            <Table caption="Small channels with outsized views">
              <thead>
                <tr>
                  {['Channel', 'Subs', 'Age (months)', 'Avg ×', 'Top views', 'Sample titles'].map(c => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {niches.data.niches.map(n => (
                  <tr key={n.channelId}>
                    <td>
                      <a href={`https://www.youtube.com/channel/${encodeURIComponent(n.channelId)}`} target="_blank" rel="noreferrer">
                        {n.channel}
                      </a>
                    </td>
                    <td className="num">{format(n.subscribers)}</td>
                    <td className="num">{format(n.channelAgeDays === null ? null : Math.round(n.channelAgeDays / 30))}</td>
                    <td>
                      <OutlierMark value={n.avgX} />
                    </td>
                    <td className="num">{format(n.topViews)}</td>
                    <td>{n.sampleTitles.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No results yet</EmptyTitle>
                <EmptyDescription>Niches appear as the index grows.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <Alert>
            <AlertDescription>Small or young channels beating their own average. No invented niche score.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  if (tab === 'Title formulas')
    return formulas.isPending ? (
      <div role="status" className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">Loading formulas…</span>
        <Skeleton className="h-16 w-full" />
      </div>
    ) : formulas.isError ? (
      <QueryError error={formulas.error} retry={() => void formulas.refetch()} />
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>Title formulas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>
            From {format(formulas.data.sample)} outlier titles. {formulas.data.note}
          </p>
          {!formulas.data.formulas.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No results yet</EmptyTitle>
                <EmptyDescription>No recurring formulas yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            formulas.data.formulas.map(f => (
              <article key={f.formula} className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">{f.formula}</h3>
                <p>
                  {format(f.uses)} outliers · median <OutlierMark value={f.medianX} />
                </p>
                <ul className="flex flex-col gap-2">
                  {f.examples.map(v => (
                    <li key={v.id}>
                      {v.title} — {v.channel} · <OutlierMark value={v.x} />
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    );
  return rows.isPending ? (
    <div role="status" className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Searching local index…</span>
      <Skeleton className="h-16 w-full" />
    </div>
  ) : rows.isError ? (
    <QueryError error={rows.error} retry={() => void rows.refetch()} />
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>Outliers</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.data.results.length ? (
          <Table caption="Indexed outliers">
            <thead>
              <tr>
                {['Video', 'Channel', 'Subscribers', 'Views', '× channel avg'].map(c => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.data.results.map(v => (
                <tr key={v.id}>
                  <td>
                    <a
                      className="flex items-start gap-3 font-medium"
                      href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        className="aspect-video w-20 shrink-0 rounded-md object-cover ring-1 ring-border"
                        src={v.thumbnail}
                        alt=""
                        width="96"
                        height="54"
                        loading="lazy"
                      />
                      <span className="line-clamp-2 font-medium">{v.title}</span>
                    </a>
                  </td>
                  <td>{v.channel_title}</td>
                  <td className="num">{format(v.channel_subs)}</td>
                  <td className="num">{format(v.views)}</td>
                  <td>
                    <OutlierMark value={v.x} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>No outliers found</EmptyTitle>
              <EmptyDescription>
                {rows.data.indexed ? 'No outliers match these filters.' : 'The index is empty. Use Crawl now or wait for the daily crawl.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <Alert>
          <AlertDescription>{rows.data.note}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

export function OutlierIndex() {
  const client = useQueryClient();
  const [tab, setTab] = useState('Outliers');
  const [params, setParams] = useState('minX=3&days=365&limit=60');
  const crawl = useMutation({
    mutationFn: () => mutateJson<IndexCrawlResponse>('/index/crawl?wait=1', 'POST', {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['index'] });
      void client.invalidateQueries({ queryKey: ['quota'] });
    },
  });
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setParams(new URLSearchParams([...data.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : ''])).toString());
  }
  return (
    <>
      <PageHeader
        title="Outlier index"
        description="Search your local outlier database for free. Grow it with spare YouTube quota."
        actions={
          <Button type="button" variant="outline" disabled={crawl.isPending} onClick={() => crawl.mutate()}>
            {crawl.isPending ? <Spinner data-icon="inline-start" /> : null}
            {crawl.isPending ? 'Crawling…' : 'Crawl now'}
          </Button>
        }
      />
      <Alert>
        <AlertDescription>
          Crawls use spare quota, about 102 units per search, within the configured budget and reserve. Searches also have a 100/day limit.
        </AlertDescription>
      </Alert>
      {crawl.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{crawl.error.message}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => crawl.mutate()}>
            Try again
          </Button>
        </Alert>
      ) : null}
      {crawl.data ? (
        <p role="status">
          {crawl.data.skipped
            ? `Skipped: ${crawl.data.skipped}`
            : `${format(crawl.data.queries)} searches · ${format(crawl.data.added)} new videos · ${format(crawl.data.units)} units`}
        </p>
      ) : null}
      <Tabs labels={['Outliers', 'Niche finder', 'Title formulas', 'Similar thumbnails']} value={tab} onChange={setTab} />
      {tab === 'Similar thumbnails' ? (
        <ThumbnailSearch />
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3" onSubmit={search}>
            <FieldGroup className="flex-row flex-wrap items-end gap-3">
              <Field className="w-auto">
                <FieldLabel id="outlier-index-filter-4-label" htmlFor="outlier-index-filter-4">
                  Topic
                </FieldLabel>
                <Input id="outlier-index-filter-4" name="q" type="search" />
              </Field>
              <Field className="w-auto">
                <FieldLabel id="outlier-index-filter-5-label" htmlFor="outlier-index-filter-5">
                  Min ×
                </FieldLabel>
                <Input id="outlier-index-filter-5" name="minX" type="number" defaultValue="3" min="0" step="0.5" />
              </Field>
              <Field className="w-auto">
                <FieldLabel id="outlier-index-filter-6-label" htmlFor="outlier-index-filter-6">
                  Format
                </FieldLabel>
                <FilterChoice
                  id="outlier-index-filter-6"
                  name="format"
                  initial="all"
                  options={[
                    ['all', 'All formats'],
                    ['long', 'Long-form'],
                    ['shorts', 'Shorts'],
                  ]}
                />
              </Field>
              <Field className="w-auto">
                <FieldLabel id="outlier-index-filter-7-label" htmlFor="outlier-index-filter-7">
                  Max subscribers
                </FieldLabel>
                <Input id="outlier-index-filter-7" name="maxSubs" type="number" min="1" />
              </Field>
              <Field className="w-auto">
                <FieldLabel id="outlier-index-filter-8-label" htmlFor="outlier-index-filter-8">
                  Within days
                </FieldLabel>
                <Input id="outlier-index-filter-8" name="days" type="number" defaultValue="365" min="1" required />
              </Field>
              <Field className="w-auto">
                <FieldLabel id="outlier-index-filter-9-label" htmlFor="outlier-index-filter-9">
                  Sort
                </FieldLabel>
                <FilterChoice
                  id="outlier-index-filter-9"
                  name="sort"
                  initial="x"
                  options={[
                    ['x', 'Outlier ×'],
                    ['views', 'Views'],
                    ['recent', 'Newest'],
                    ['vpd', 'Views/day'],
                  ]}
                />
              </Field>
              <Button type="submit">Search</Button>
            </FieldGroup>
          </form>
          <IndexResults tab={tab} params={params} />
        </>
      )}
      <IndexStats />
    </>
  );
}
