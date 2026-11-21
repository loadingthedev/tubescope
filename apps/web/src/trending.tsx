import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TrendingResponse,
  TrendingVideo,
  CategoriesResponse,
  NicheChannelsResponse,
  TitlePatternsResponse,
  ChannelVideosResponse,
  Channel,
  ResearchBoardsResponse,
  BoardSaveResponse,
} from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, ChannelSelect, useOwnedChannel, Table, Tabs } from './components/research';
import { format } from './components/format';

function SaveVideo({ video, boardId }: { video: TrendingVideo; boardId: number }) {
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => mutateJson<BoardSaveResponse>(`/boards/id/${boardId}/items`, 'POST', { kind: 'video', ref: video }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['boards'] });
      toast.success('Saved');
    },
  });
  return (
    <>
      <Button type="button" variant="link" disabled={!boardId || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Spinner data-icon="inline-start" /> : null}
        {save.isPending ? 'Saving…' : 'Save'}
      </Button>
      {save.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{save.error.message}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
function TrendingVideos({ channelId }: { channelId?: string }) {
  const client = useQueryClient();
  const [country, setCountry] = useState('US');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState({ country: 'US', category: '' });
  const [boardId, setBoardId] = useState(0);
  const categories = useQuery({
    queryKey: ['categories', country],
    queryFn: ({ signal }) => getJson<CategoriesResponse>(`/categories?${new URLSearchParams({ country })}`, signal),
    enabled: country.length === 2,
    staleTime: 86_400_000,
  });
  const boards = useQuery({
    queryKey: ['boards', channelId],
    queryFn: ({ signal }) => getJson<ResearchBoardsResponse>(`/boards/${channelId}`, signal),
    enabled: Boolean(channelId),
  });
  const rows = useQuery({
    queryKey: ['trending', search],
    queryFn: async ({ signal }) => {
      const data = await getJson<TrendingResponse>(`/trending?${new URLSearchParams(search)}`, signal);
      void client.invalidateQueries({ queryKey: ['quota'] });
      return data;
    },
    staleTime: 10_800_000,
  });
  const selectedBoard = boards.data?.find(b => b.id === boardId)?.id || boards.data?.[0]?.id || 0;
  return (
    <>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={e => {
          e.preventDefault();
          if (search.country === country && search.category === category) void rows.refetch();
          else setSearch({ country, category });
        }}
      >
        <FieldGroup className="flex-row flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel htmlFor="trending-filter-1">Country code</FieldLabel>
            <Input
              id="trending-filter-1"
              value={country}
              minLength={2}
              maxLength={2}
              required
              pattern="[A-Z]{2}"
              onChange={e => {
                setCountry(e.target.value.toUpperCase());
                setCategory('');
              }}
            />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="trending-filter-2">Category</FieldLabel>
            <Select value={category || 'all'} onValueChange={value => setCategory(value === 'all' ? '' : value)}>
              <SelectTrigger id="trending-filter-2" className="min-w-40 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.data?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" disabled={rows.isFetching}>
            {rows.isFetching ? <Spinner data-icon="inline-start" /> : null}
            Load
          </Button>
        </FieldGroup>
      </form>
      {categories.isFetching ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Loading categories…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {categories.isError ? <QueryError error={categories.error} retry={() => void categories.refetch()} /> : null}
      <Alert>
        <AlertDescription>YouTube mostPopular chart · 1 quota unit · cached 3 hours. Category lookup uses 1 unit when uncached.</AlertDescription>
      </Alert>
      {channelId ? (
        boards.isPending ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Loading boards…</span>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : boards.isError ? (
          <QueryError error={boards.error} retry={() => void boards.refetch()} />
        ) : boards.data.length ? (
          <Field className="w-auto">
            <FieldLabel htmlFor="trending-filter-3">Save to board</FieldLabel>
            <Select value={String(selectedBoard)} onValueChange={value => setBoardId(Number(value))}>
              <SelectTrigger id="trending-filter-3" className="min-w-40 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {boards.data.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-muted-foreground">Create a local board in Boards to save videos.</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Select an owned channel to save videos to a board.</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Trending videos · {search.country}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {rows.isPending ? (
            <div role="status" className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Loading trending videos…</span>
              <Skeleton className="h-16 w-full" />
            </div>
          ) : rows.isError ? (
            <QueryError error={rows.error} retry={() => void rows.refetch()} />
          ) : !rows.data.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No results yet</EmptyTitle>
                <EmptyDescription>No trending videos returned for this selection.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table caption="YouTube most popular videos">
              <thead>
                <tr>
                  {['#', 'Video', 'Channel', 'Views', 'Likes', 'Comments', 'Local actions'].map(c => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.data.map((v, i) => (
                  <tr key={v.id}>
                    <td className="num">{format(i + 1)}</td>
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
                    <td className="num">{format(v.view_count)}</td>
                    <td className="num">{format(v.like_count)}</td>
                    <td className="num">{format(v.comment_count)}</td>
                    <td>
                      <SaveVideo key={`${v.id}:${selectedBoard}`} video={v} boardId={selectedBoard} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
function TrackChannel({ id, owner }: { id: string; owner?: string }) {
  const client = useQueryClient();
  const track = useMutation({
    mutationFn: () => mutateJson<Channel>(`/competitors/${owner}`, 'POST', { input: id }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['competitors'] });
      void client.invalidateQueries({ queryKey: ['quota'] });
    },
  });
  return (
    <>
      <Button type="button" variant="link" disabled={!owner || track.isPending || track.isSuccess} onClick={() => track.mutate()}>
        {track.isPending ? <Spinner data-icon="inline-start" /> : null}
        {track.isSuccess ? 'Tracked' : track.isPending ? 'Tracking…' : '+ competitor'}
      </Button>
      {track.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{track.error.message}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
function NicheExplorer({ channelId }: { channelId?: string }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('US');
  const client = useQueryClient();
  const search = useMutation({
    mutationFn: () => getJson<NicheChannelsResponse>(`/niche/channels?${new URLSearchParams({ q: q.trim(), country })}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['quota'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Niche explorer</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={e => {
            e.preventDefault();
            search.mutate();
          }}
        >
          <FieldGroup className="flex-row flex-wrap items-end gap-3">
            <Field className="w-auto">
              <FieldLabel htmlFor="trending-filter-4">Niche</FieldLabel>
              <Input id="trending-filter-4" value={q} onChange={e => setQ(e.target.value)} required />
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="trending-filter-5">Country code</FieldLabel>
              <Input
                id="trending-filter-5"
                value={country}
                onChange={e => setCountry(e.target.value.toUpperCase())}
                required
                pattern="[A-Z]{2}"
                maxLength={2}
              />
            </Field>
            <Button type="submit" disabled={search.isPending || !q.trim()}>
              {search.isPending ? <Spinner data-icon="inline-start" /> : null}
              Find channels
            </Button>
          </FieldGroup>
        </form>
        <p className="text-sm text-muted-foreground">
          One search (100 units) plus channel details (1 unit). Tracking stores a local competitor and syncs its public library.
        </p>
        {search.isPending ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Finding channels…</span>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}
        {search.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{search.error.message}</AlertDescription>
            <Button variant="outline" size="sm" onClick={() => search.mutate()}>
              Try again
            </Button>
          </Alert>
        ) : null}
        {search.data ? (
          !search.data.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No results yet</EmptyTitle>
                <EmptyDescription>No channels found for this niche.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table caption="Niche channels sized by views per video">
              <thead>
                <tr>
                  {['Channel', 'Subs', 'Total views', 'Videos', 'Views / video', 'Age (years)', 'Local actions'].map(c => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {search.data.map(c => (
                  <tr key={c.id}>
                    <td>
                      <a href={`https://www.youtube.com/channel/${encodeURIComponent(c.id)}`} target="_blank" rel="noreferrer">
                        {c.title}
                      </a>
                    </td>
                    <td className="num">{format(c.subscriber_count)}</td>
                    <td className="num">{format(c.view_count)}</td>
                    <td className="num">{format(c.video_count)}</td>
                    <td className="num">{format(c.views_per_video)}</td>
                    <td className="num">{format(c.age_days / 365)}</td>
                    <td>
                      <TrackChannel key={`${c.id}:${channelId}`} id={c.id} owner={channelId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Search a niche to size its channels. The API returns channel statistics, with no niche score.</p>
        )}
      </CardContent>
    </Card>
  );
}
function TitlePatterns({ channelId }: { channelId?: string }) {
  const [titles, setTitles] = useState('');
  const patterns = useMutation({
    mutationFn: () =>
      mutateJson<TitlePatternsResponse>('/titles/patterns', 'POST', {
        titles: titles
          .split('\n')
          .map(t => t.trim())
          .filter(Boolean),
      }),
  });
  const mine = useMutation({
    mutationFn: () => getJson<ChannelVideosResponse>(`/channels/${channelId}/videos?limit=300`),
    onSuccess: data => setTitles(data.videos.map(v => v.title).join('\n')),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Title structure analysis</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p>Paste one title per line to find recurring structures. Local analysis; no AI or quota.</p>
        <form
          onSubmit={e => {
            e.preventDefault();
            patterns.mutate();
          }}
        >
          <FieldGroup className="flex-row flex-wrap items-end gap-3">
            <Field>
              <FieldLabel htmlFor="pattern-titles">Titles</FieldLabel>
              <Textarea id="pattern-titles" className="min-h-48" rows={8} value={titles} onChange={e => setTitles(e.target.value)} required />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Button type="submit" disabled={patterns.isPending || !titles.trim()}>
                {patterns.isPending ? <Spinner data-icon="inline-start" /> : null}
                Analyze
              </Button>
              <Button type="button" variant="outline" disabled={!channelId || mine.isPending} onClick={() => mine.mutate()}>
                {mine.isPending ? <Spinner data-icon="inline-start" /> : null}
                {mine.isPending ? 'Loading titles…' : 'Load my titles'}
              </Button>
            </div>
          </FieldGroup>
        </form>
        {mine.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{mine.error.message}</AlertDescription>
            <Button variant="outline" size="sm" onClick={() => mine.mutate()}>
              Try again
            </Button>
          </Alert>
        ) : null}
        {mine.isSuccess && !mine.data.videos.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>No results yet</EmptyTitle>
              <EmptyDescription>No synced titles for this channel.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {patterns.isPending ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Analyzing titles…</span>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}
        {patterns.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{patterns.error.message}</AlertDescription>
            <Button variant="outline" size="sm" onClick={() => patterns.mutate()}>
              Try again
            </Button>
          </Alert>
        ) : null}
        {patterns.data ? (
          <>
            <p>
              {format(patterns.data.sample)} titles · median {format(patterns.data.medianLength)} characters / {format(patterns.data.medianWords)} words
            </p>
            {patterns.data.patterns.some(p => p.count) ? (
              <Table caption="Recurring title structures">
                <thead>
                  <tr>
                    <th scope="col">Pattern</th>
                    <th scope="col">Count</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {patterns.data.patterns
                    .filter(p => p.count)
                    .map(p => (
                      <tr key={p.pattern}>
                        <td>{p.pattern}</td>
                        <td className="num">{format(p.count)}</td>
                        <td className="num">{format(p.share * 100)}%</td>
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
                  <EmptyDescription>No recurring structures found.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
export function Trending() {
  const [tab, setTab] = useState('Trending videos');
  const channel = useOwnedChannel();
  return (
    <>
      <PageHeader title="Trending & niches" description="Explore YouTube’s mostPopular chart, size niche channels, and inspect title patterns." />
      {channel.channels.isPending ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Loading owned channels…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.current ? (
        <ChannelSelect channel={channel} />
      ) : (
        <p className="text-sm text-muted-foreground">Add an owned channel for tracking and saved references.</p>
      )}
      <Tabs labels={['Trending videos', 'Niche explorer', 'Title patterns']} value={tab} onChange={setTab} />
      {tab === 'Trending videos' ? (
        <TrendingVideos channelId={channel.current?.id} />
      ) : tab === 'Niche explorer' ? (
        <NicheExplorer channelId={channel.current?.id} />
      ) : (
        <TitlePatterns key={channel.current?.id} channelId={channel.current?.id} />
      )}
    </>
  );
}
