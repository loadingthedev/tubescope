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
    },
  });
  return (
    <>
      <button type="button" className="text-button" disabled={!boardId || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : 'Save'}
      </button>
      {save.isSuccess ? <span role="status">Saved</span> : null}
      {save.isError ? <p role="alert">{save.error.message}</p> : null}
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
        className="filters"
        onSubmit={e => {
          e.preventDefault();
          if (search.country === country && search.category === category) void rows.refetch();
          else setSearch({ country, category });
        }}
      >
        <label>
          Country code
          <input
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
        </label>
        <label>
          Category
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.data?.map(c => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary-button" disabled={rows.isFetching}>
          Load
        </button>
      </form>
      {categories.isFetching ? <p role="status">Loading categories…</p> : null}
      {categories.isError ? <QueryError error={categories.error} retry={() => void categories.refetch()} /> : null}
      <p className="source-note">YouTube mostPopular chart · 1 quota unit · cached 3 hours. Category lookup uses 1 unit when uncached.</p>
      {channelId ? (
        boards.isPending ? (
          <p role="status">Loading boards…</p>
        ) : boards.isError ? (
          <QueryError error={boards.error} retry={() => void boards.refetch()} />
        ) : boards.data.length ? (
          <label className="channel-select">
            Save to board
            <select value={selectedBoard} onChange={e => setBoardId(Number(e.target.value))}>
              {boards.data.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted">Create a local board in Boards to save videos.</p>
        )
      ) : (
        <p className="muted">Select an owned channel to save videos to a board.</p>
      )}
      <section className="dashboard-card">
        <h2>Trending videos · {search.country}</h2>
        {rows.isPending ? (
          <p role="status">Loading trending videos…</p>
        ) : rows.isError ? (
          <QueryError error={rows.error} retry={() => void rows.refetch()} />
        ) : !rows.data.length ? (
          <p>No trending videos returned for this selection.</p>
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
                  <td>{format(i + 1)}</td>
                  <td>
                    <a className="video-cell" href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noreferrer">
                      <img src={v.thumbnail} alt="" width="96" height="54" loading="lazy" />
                      {v.title}
                    </a>
                  </td>
                  <td>{v.channel_title}</td>
                  <td>{format(v.view_count)}</td>
                  <td>{format(v.like_count)}</td>
                  <td>{format(v.comment_count)}</td>
                  <td>
                    <SaveVideo key={`${v.id}:${selectedBoard}`} video={v} boardId={selectedBoard} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
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
      <button type="button" className="text-button" disabled={!owner || track.isPending || track.isSuccess} onClick={() => track.mutate()}>
        {track.isSuccess ? 'Tracked' : track.isPending ? 'Tracking…' : '+ competitor'}
      </button>
      {track.isError ? <p role="alert">{track.error.message}</p> : null}
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
    <section className="dashboard-card">
      <h2>Niche explorer</h2>
      <form
        className="filters"
        onSubmit={e => {
          e.preventDefault();
          search.mutate();
        }}
      >
        <label>
          Niche
          <input value={q} onChange={e => setQ(e.target.value)} required />
        </label>
        <label>
          Country code
          <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} required pattern="[A-Z]{2}" maxLength={2} />
        </label>
        <button type="submit" className="primary-button" disabled={search.isPending || !q.trim()}>
          Find channels
        </button>
      </form>
      <p className="source-note">One search (100 units) plus channel details (1 unit). Tracking stores a local competitor and syncs its public library.</p>
      {search.isPending ? <p role="status">Finding channels…</p> : null}
      {search.isError ? <QueryError error={search.error} retry={() => search.mutate()} /> : null}
      {search.data ? (
        !search.data.length ? (
          <p>No channels found for this niche.</p>
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
                  <td>{format(c.subscriber_count)}</td>
                  <td>{format(c.view_count)}</td>
                  <td>{format(c.video_count)}</td>
                  <td>{format(c.views_per_video)}</td>
                  <td>{format(c.age_days / 365)}</td>
                  <td>
                    <TrackChannel key={`${c.id}:${channelId}`} id={c.id} owner={channelId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : (
        <p className="muted">Search a niche to size its channels. The API returns channel statistics, with no niche score.</p>
      )}
    </section>
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
    <section className="dashboard-card">
      <h2>Title structure analysis</h2>
      <p>Paste one title per line to find recurring structures. Local analysis; no AI or quota.</p>
      <form
        onSubmit={e => {
          e.preventDefault();
          patterns.mutate();
        }}
      >
        <label htmlFor="pattern-titles">Titles</label>
        <textarea id="pattern-titles" className="research-textarea" rows={8} value={titles} onChange={e => setTitles(e.target.value)} required />
        <div className="filters">
          <button type="submit" className="primary-button" disabled={patterns.isPending || !titles.trim()}>
            Analyze
          </button>
          <button type="button" className="secondary-button" disabled={!channelId || mine.isPending} onClick={() => mine.mutate()}>
            {mine.isPending ? 'Loading titles…' : 'Load my titles'}
          </button>
        </div>
      </form>
      {mine.isError ? <QueryError error={mine.error} retry={() => mine.mutate()} /> : null}
      {mine.isSuccess && !mine.data.videos.length ? <p>No synced titles for this channel.</p> : null}
      {patterns.isPending ? <p role="status">Analyzing titles…</p> : null}
      {patterns.isError ? <QueryError error={patterns.error} retry={() => patterns.mutate()} /> : null}
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
                      <td>{format(p.count)}</td>
                      <td>{format(p.share * 100)}%</td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          ) : (
            <p>No recurring structures found.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
export function Trending() {
  const [tab, setTab] = useState('Trending videos');
  const channel = useOwnedChannel();
  return (
    <div>
      <PageHeader title="Trending & niches" description="Explore YouTube’s mostPopular chart, size niche channels, and inspect title patterns." />
      {channel.channels.isPending ? (
        <p role="status">Loading owned channels…</p>
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.current ? (
        <ChannelSelect channel={channel} />
      ) : (
        <p className="muted">Add an owned channel for tracking and saved references.</p>
      )}
      <Tabs labels={['Trending videos', 'Niche explorer', 'Title patterns']} value={tab} onChange={setTab} />
      {tab === 'Trending videos' ? (
        <TrendingVideos channelId={channel.current?.id} />
      ) : tab === 'Niche explorer' ? (
        <NicheExplorer channelId={channel.current?.id} />
      ) : (
        <TitlePatterns key={channel.current?.id} channelId={channel.current?.id} />
      )}
    </div>
  );
}
