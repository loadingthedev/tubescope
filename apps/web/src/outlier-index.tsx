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
import { PageHeader, QueryError, StatCard, Table, Tabs } from './components/research';
import { format, times, timestamp } from './components/format';

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
    <section className="dashboard-card">
      <h2>Index & seed queries</h2>
      {stats.isPending ? (
        <p role="status">Loading index stats…</p>
      ) : stats.isError ? (
        <QueryError error={stats.error} retry={() => void stats.refetch()} />
      ) : (
        <>
          <div className="metrics">
            <StatCard label="Videos" value={format(stats.data.videos)} note={`${format(stats.data.channels)} channels`} />
            <StatCard label="Outliers (3×+)" value={format(stats.data.outliers)} note={`${format(stats.data.thumbs)} thumbnails`} />
          </div>
          <p className="muted">Last grown: {timestamp(stats.data.last?.at || null)}</p>
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
                  <td>{format(q.runs)}</td>
                  <td>{timestamp(q.last_run)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!stats.data.queries.length ? <p>No seed queries yet.</p> : null}
        </>
      )}
      <form
        className="filters"
        onSubmit={e => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <label>
          Seed query
          <input value={seed} onChange={e => setSeed(e.target.value)} required minLength={3} />
        </label>
        <button type="submit" className="secondary-button" disabled={add.isPending || seed.trim().length < 3}>
          Add query
        </button>
      </form>
      {add.isError ? <QueryError error={add.error} retry={() => add.mutate()} /> : null}
      {add.data ? <p role="status">{add.data.note}</p> : null}
      <p className="source-note">Adding a query is local. It runs on the next crawl. Query removal is unavailable: the API has no delete route.</p>
    </section>
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
    <section className="dashboard-card">
      <h2>Similar thumbnails</h2>
      <form
        className="filters"
        onSubmit={e => {
          e.preventDefault();
          match.mutate();
        }}
      >
        <label>
          Video ID or YouTube URL
          <input value={video} onChange={e => setVideo(e.target.value)} />
        </label>
        <label>
          Or local image path
          <input value={file} onChange={e => setFile(e.target.value)} placeholder="/Users/…/thumb.jpg" />
        </label>
        <button type="submit" className="primary-button" disabled={match.isPending || (!video.trim() && !file.trim())}>
          Find similar
        </button>
      </form>
      {match.isPending ? <p role="status">Comparing thumbnails…</p> : null}
      {match.isError ? <QueryError error={match.error} retry={() => match.mutate()} /> : null}
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
                      <a className="video-cell" href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`} target="_blank" rel="noreferrer">
                        <img src={v.thumbnail} alt="" width="96" height="54" />
                        {v.title || v.videoId}
                      </a>
                    </td>
                    <td>{v.channel}</td>
                    <td>{format(v.views)}</td>
                    <td>{times(v.x)}</td>
                    <td>{format(v.similarity * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p>No close matches yet.</p>
          )}
        </>
      ) : (
        <p className="muted">Choose a video or local image. Matching uses image data; no AI.</p>
      )}
    </section>
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
      <p role="status">Loading niches…</p>
    ) : niches.isError ? (
      <QueryError error={niches.error} retry={() => void niches.refetch()} />
    ) : (
      <section className="dashboard-card">
        <h2>Niche finder</h2>
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
                  <td>{format(n.subscribers)}</td>
                  <td>{format(n.channelAgeDays === null ? null : Math.round(n.channelAgeDays / 30))}</td>
                  <td>{times(n.avgX)}</td>
                  <td>{format(n.topViews)}</td>
                  <td>{n.sampleTitles.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p>Niches appear as the index grows.</p>
        )}
        <p className="source-note">Small or young channels beating their own average. No invented niche score.</p>
      </section>
    );
  if (tab === 'Title formulas')
    return formulas.isPending ? (
      <p role="status">Loading formulas…</p>
    ) : formulas.isError ? (
      <QueryError error={formulas.error} retry={() => void formulas.refetch()} />
    ) : (
      <section className="dashboard-card">
        <h2>Title formulas</h2>
        <p>
          From {format(formulas.data.sample)} outlier titles. {formulas.data.note}
        </p>
        {!formulas.data.formulas.length ? (
          <p>No recurring formulas yet.</p>
        ) : (
          formulas.data.formulas.map(f => (
            <article key={f.formula}>
              <h3>{f.formula}</h3>
              <p>
                {format(f.uses)} outliers · median {times(f.medianX)}
              </p>
              <ul>
                {f.examples.map(v => (
                  <li key={v.id}>
                    {v.title} — {v.channel} · {times(v.x)}
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>
    );
  return rows.isPending ? (
    <p role="status">Searching local index…</p>
  ) : rows.isError ? (
    <QueryError error={rows.error} retry={() => void rows.refetch()} />
  ) : (
    <section className="dashboard-card">
      <h2>Outliers</h2>
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
                  <a className="video-cell" href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noreferrer">
                    <img src={v.thumbnail} alt="" width="96" height="54" loading="lazy" />
                    {v.title}
                  </a>
                </td>
                <td>{v.channel_title}</td>
                <td>{format(v.channel_subs)}</td>
                <td>{format(v.views)}</td>
                <td>{times(v.x)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p>{rows.data.indexed ? 'No outliers match these filters.' : 'The index is empty. Use Crawl now or wait for the daily crawl.'}</p>
      )}
      <p className="source-note">{rows.data.note}</p>
    </section>
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
    <div>
      <PageHeader title="Outlier index" description="Search your local outlier database for free. Grow it with spare YouTube quota." />
      <button type="button" className="secondary-button" disabled={crawl.isPending} onClick={() => crawl.mutate()}>
        {crawl.isPending ? 'Crawling…' : 'Crawl now'}
      </button>
      <p className="source-note">
        Crawls use spare quota, about 102 units per search, within the configured budget and reserve. Searches also have a 100/day limit.
      </p>
      {crawl.isError ? <QueryError error={crawl.error} retry={() => crawl.mutate()} /> : null}
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
          <form className="filters" onSubmit={search}>
            <label>
              Topic
              <input name="q" type="search" />
            </label>
            <label>
              Min ×<input name="minX" type="number" defaultValue="3" min="0" step="0.5" />
            </label>
            <label>
              Format
              <select name="format">
                <option value="all">All formats</option>
                <option value="long">Long-form</option>
                <option value="shorts">Shorts</option>
              </select>
            </label>
            <label>
              Max subscribers
              <input name="maxSubs" type="number" min="1" />
            </label>
            <label>
              Within days
              <input name="days" type="number" defaultValue="365" min="1" required />
            </label>
            <label>
              Sort
              <select name="sort">
                <option value="x">Outlier ×</option>
                <option value="views">Views</option>
                <option value="recent">Newest</option>
                <option value="vpd">Views/day</option>
              </select>
            </label>
            <button type="submit" className="primary-button">
              Search
            </button>
          </form>
          <IndexResults tab={tab} params={params} />
        </>
      )}
      <IndexStats />
    </div>
  );
}
