import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { ChannelSyncResponse, ChannelVideosResponse, VideoChecklistResponse, VideoDetailResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { ChannelSelect, PageHeader, QueryError, StatCard, Table, Tabs, useOwnedChannel } from './components/research';
import { LineChart } from './components/line-chart';
import { duration, format, timestamp } from './components/format';

function Checklist({ id }: { id: string }) {
  const checks = useQuery({
    queryKey: ['video-checklist', id],
    queryFn: ({ signal }) => getJson<VideoChecklistResponse | null>(`/videos/${encodeURIComponent(id)}/checklist`, signal),
  });
  if (checks.isError) return <QueryError error={checks.error} retry={() => void checks.refetch()} />;
  if (checks.isPending) return <p role="status">Loading checklist…</p>;
  if (!checks.data) return <p>No checklist available. Sync this video first.</p>;
  const data = checks.data;
  const sections = [
    { title: 'Publishing checklist', score: data.score, rows: data.items.map(check => ({ ...check, name: check.item })) },
    { title: 'Title checks', score: data.title.score, rows: data.title.checks },
    { title: 'Description checks', score: data.description.score, rows: data.description.checks },
  ];
  return (
    <>
      <p className="muted">{data.title.note}</p>
      {sections.map(section => (
        <section key={section.title}>
          <h3>
            {section.title} · {format(section.score)}/100
          </h3>
          {!section.rows.length ? (
            <p>No checks returned.</p>
          ) : (
            <ul className="check-list">
              {section.rows.map(check => (
                <li key={check.name}>
                  <strong>
                    {check.pass ? 'Pass' : 'Check'}: {check.name}
                  </strong>
                  <p className="muted">{check.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
export function VideoDetail() {
  const { videoId = '' } = useParams();
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
  if (video.isPending) return <p role="status">Loading video…</p>;
  const data = video.data;
  const owned = channel.owned.some(item => item.id === data.channel_id);
  return (
    <div className="library-page">
      <Link to="/library">← Video library</Link>
      <PageHeader
        title={data.title}
        section="Video library"
        description={`${data.channel_title || ''} · ${timestamp(data.published_at)} · ${duration(data.duration_sec)} · ${data.is_short ? 'Shorts' : data.is_live ? 'Live' : 'Long-form'} · ${data.format}`}
      />
      <p>
        <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`} target="_blank" rel="noreferrer">
          Open on YouTube ↗
        </a>
      </p>
      <div className="metrics">
        <StatCard label="Views" value={format(data.view_count)} note="Latest synced count" />
        <StatCard label="Likes" value={format(data.like_count)} note="Latest synced count" />
        <StatCard label="Comments" value={format(data.comment_count)} note="Latest synced count" />
      </div>
      <Tabs labels={owned ? ['Overview', 'Checklist', 'History'] : ['Overview', 'History']} value={tab} onChange={setTab} />
      <section className="dashboard-card">
        {tab === 'Overview' ? (
          <>
            <h2>Description</h2>
            <p className="video-description">{data.description || 'No description.'}</p>
            <h2>Tags ({format(data.tags.length)})</h2>
            <p>{data.tags.join(', ') || 'No tags.'}</p>
          </>
        ) : tab === 'Checklist' && owned ? (
          <Checklist id={data.id} />
        ) : (
          <>
            <h2>Daily view snapshots</h2>
            <LineChart label="Video view history" points={data.history.map(point => ({ day: point.day, value: point.views }))} />
            <h2>Observed metadata changes</h2>
            {!data.metadataHistory.length ? (
              <p className="muted">No metadata changes observed yet.</p>
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
                      <td className="metadata-value">{item.old_value || '—'}</td>
                      <td className="metadata-value">{item.new_value || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </section>
    </div>
  );
}
export function Library() {
  const channel = useOwnedChannel();
  const [filters, setFilters] = useState({ q: '', format: 'all', sort: 'published_at', dir: 'desc', from: '', to: '' });
  const [page, setPage] = useState({ key: '', offset: 0 });
  const id = channel.current?.id || '';
  const client = useQueryClient();
  const sync = useMutation({
    mutationFn: () => mutateJson<ChannelSyncResponse>(`/channels/${encodeURIComponent(id)}/sync`, 'POST', { force: true }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['library', id] }),
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
  function filter(name: keyof typeof filters, value: string) {
    setFilters(previous => ({ ...previous, [name]: value }));
  }
  return (
    <div className="library-page">
      <PageHeader title="Video library" description="Search synced videos. Inspect stats, view history and non-AI packaging checks." />
      {channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.channels.isPending ? (
        <p role="status">Loading channels…</p>
      ) : !id ? (
        <p>
          No owned channels yet. <Link to="/channels">Add a channel</Link> to load its library.
        </p>
      ) : (
        <>
          <ChannelSelect channel={channel} />
          <div className="channel-actions">
            <a className="secondary-button" href={`/api/channels/${encodeURIComponent(id)}/export/videos.csv`}>
              Export CSV
            </a>
            <a className="secondary-button" href={`/api/channels/${encodeURIComponent(id)}/backup`}>
              Backup JSON
            </a>
            <button type="button" className="secondary-button" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? 'Syncing…' : 'Sync'}
            </button>
          </div>
          {sync.isError ? (
            <p role="alert" className="error-message">
              {sync.error.message}
            </p>
          ) : sync.data ? (
            <p role="status">Synced {format(sync.data.synced)} videos.</p>
          ) : null}
          <div className="filters">
            <label>
              Search
              <input type="search" value={filters.q} onChange={event => filter('q', event.target.value)} placeholder="Title or description" />
            </label>
            <label>
              Format
              <select value={filters.format} onChange={event => filter('format', event.target.value)}>
                <option value="all">All formats</option>
                <option value="long">Long-form</option>
                <option value="shorts">Shorts</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label>
              Sort
              <select value={filters.sort} onChange={event => filter('sort', event.target.value)}>
                {[
                  ['published_at', 'Published'],
                  ['view_count', 'Views'],
                  ['like_count', 'Likes'],
                  ['comment_count', 'Comments'],
                  ['duration_sec', 'Duration'],
                  ['title', 'Title'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <select value={filters.dir} onChange={event => filter('dir', event.target.value)}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
            <label>
              From
              <input type="date" value={filters.from} onChange={event => filter('from', event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={filters.to} min={filters.from} onChange={event => filter('to', event.target.value)} />
            </label>
          </div>
          {videos.isError ? (
            <QueryError error={videos.error} retry={() => void videos.refetch()} />
          ) : videos.isPending ? (
            <p role="status">Loading videos…</p>
          ) : (
            <>
              <p>{format(videos.data.total)} matching videos</p>
              {!videos.data.videos.length ? (
                <p className="muted">No matching videos. Adjust the filters or sync this channel in Channels.</p>
              ) : (
                <Table caption="Synced video library">
                  <thead>
                    <tr>
                      {['Video', 'Published', 'Format', 'Duration', 'Views', 'Likes', 'Comments'].map(label => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {videos.data.videos.map(video => (
                      <tr key={video.id}>
                        <th scope="row">
                          <Link className="video-cell" to={`/library/${encodeURIComponent(video.id)}`}>
                            {video.thumbnail ? <img src={video.thumbnail} alt="" width="96" height="54" loading="lazy" /> : null}
                            {video.title}
                          </Link>
                        </th>
                        <td>{timestamp(video.published_at)}</td>
                        <td>{video.is_short ? 'Shorts' : video.is_live ? 'Live' : 'Long-form'}</td>
                        <td>{duration(video.duration_sec)}</td>
                        <td>{format(video.view_count)}</td>
                        <td>{format(video.like_count)}</td>
                        <td>{format(video.comment_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <div className="pagination" aria-label="Library pagination">
                <button type="button" disabled={offset === 0} onClick={() => setPage({ key, offset: Math.max(0, offset - 50) })}>
                  Previous
                </button>
                <span>
                  Page {format(offset / 50 + 1)} of {format(Math.max(1, Math.ceil(videos.data.total / 50)))}
                </span>
                <button type="button" disabled={offset + 50 >= videos.data.total} onClick={() => setPage({ key, offset: offset + 50 })}>
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
