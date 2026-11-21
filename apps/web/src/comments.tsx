import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommentsResponse, CommentTemplate, GiveawayResult, LocalChange } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, Tabs } from './components/research';
import { CopyText, ConfirmDelete, DataSection, OwnedPage } from './components/data-section';
import { format, timestamp } from './components/format';
function Templates() {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const templates = useQuery({ queryKey: ['comment-templates'], queryFn: ({ signal }) => getJson<CommentTemplate[]>('/comments/templates', signal) });
  const change = useMutation({
    mutationFn: ({ path, method, data }: { path: string; method: 'POST' | 'PUT' | 'DELETE'; data?: unknown }) => mutateJson<LocalChange>(path, method, data),
    onSuccess: () => client.invalidateQueries({ queryKey: ['comment-templates'] }),
  });
  return (
    <section className="dashboard-card">
      <h2>Local text snippets</h2>
      <form
        onSubmit={e => {
          e.preventDefault();
          change.mutate(
            { path: editing ? `/comments/templates/${editing}` : '/comments/templates', method: editing ? 'PUT' : 'POST', data: { name, body } },
            {
              onSuccess: () => {
                setEditing(null);
                setName('');
                setBody('');
              },
            }
          );
        }}
      >
        <label>
          Name
          <input required value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label>
          Snippet
          <textarea required value={body} onChange={e => setBody(e.target.value)} />
        </label>
        <button type="submit" disabled={change.isPending}>
          Save local snippet
        </button>
        {editing ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setName('');
              setBody('');
            }}
          >
            Cancel edit
          </button>
        ) : null}
      </form>
      {change.isError ? <p role="alert">{change.error.message}</p> : null}
      <DataSection query={templates}>
        {data =>
          !data.length ? (
            <p>No snippets saved.</p>
          ) : (
            data.map(t => (
              <article key={t.id}>
                <h3>{t.name}</h3>
                <pre>{t.body}</pre>
                <CopyText text={t.body} />
                <button
                  type="button"
                  onClick={() => {
                    setEditing(t.id);
                    setName(t.name);
                    setBody(t.body);
                  }}
                >
                  Edit snippet
                </button>
                <ConfirmDelete
                  label={`Delete ${t.name}`}
                  disabled={change.isPending}
                  onConfirm={() => change.mutate({ path: `/comments/templates/${t.id}`, method: 'DELETE' })}
                />
              </article>
            ))
          )
        }
      </DataSection>
    </section>
  );
}
function ChannelComments({ id }: { id: string }) {
  const [filters, setFilters] = useState({ filter: 'all', video: '', q: '', order: 'time' });
  const [video, setVideo] = useState('');
  const [keyword, setKeyword] = useState('');
  const params = new URLSearchParams({ ...filters, channel: id, owner: id, pages: '3' });
  const query = useQuery({ queryKey: ['comments', id, filters], queryFn: ({ signal }) => getJson<CommentsResponse>(`/comments?${params}`, signal) });
  const giveaway = useMutation({
    mutationFn: () =>
      mutateJson<GiveawayResult>('/comments/giveaway', 'POST', {
        threads: query.data?.threads || [],
        keyword,
        ownerChannelId: id,
        excludeOwner: true,
        count: 1,
      }),
  });
  function filter(key: keyof typeof filters, value: string) {
    setFilters(f => ({ ...f, [key]: value }));
    giveaway.reset();
  }
  return (
    <>
      <div className="filters">
        <label>
          Filter
          <select value={filters.filter} onChange={e => filter('filter', e.target.value)}>
            {['all', 'unanswered', 'questions', 'mentions', 'top'].map(f => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          Comment text
          <input type="search" value={filters.q} onChange={e => filter('q', e.target.value)} />
        </label>
        <label>
          Order
          <select value={filters.order} onChange={e => filter('order', e.target.value)}>
            <option value="time">Newest</option>
            <option value="relevance">Relevance</option>
          </select>
        </label>
        <form
          onSubmit={e => {
            e.preventDefault();
            filter('video', video.trim());
          }}
        >
          <label>
            Video ID (blank = channel)
            <input value={video} onChange={e => setVideo(e.target.value)} />
          </label>
          <button type="submit">Load video comments</button>
        </form>
      </div>
      <DataSection query={query}>
        {data => (
          <section className="dashboard-card">
            <h2>Comments</h2>
            <p>
              {format(data.shown)} shown / {format(data.total)} fetched (up to three pages). Unanswered reflects the replies returned by YouTube.
            </p>
            {!data.threads.length ? (
              <p>No matching comments.</p>
            ) : (
              data.threads.map(t => (
                <article key={t.id}>
                  <h3>
                    {t.author} · {format(t.likes)} likes
                  </h3>
                  <p className="video-description">{t.text}</p>
                  <p>
                    {timestamp(t.published_at)} · {t.ownerReplied ? 'Owner replied' : 'No owner reply found'} ·{' '}
                    <a
                      href={`https://www.youtube.com/watch?v=${encodeURIComponent(t.videoId)}&lc=${encodeURIComponent(t.id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on YouTube
                    </a>
                  </p>
                  {t.replies.length ? (
                    <details>
                      <summary>
                        Read returned replies ({format(t.replies.length)} of {format(t.totalReplies)})
                      </summary>
                      {t.replies.map(r => (
                        <p key={r.id}>
                          <strong>{r.author}</strong>: {r.text}
                        </p>
                      ))}
                    </details>
                  ) : null}
                </article>
              ))
            )}
          </section>
        )}
      </DataSection>
      <section className="dashboard-card">
        <h2>Giveaway picker · local draw</h2>
        <p>Draws one unique commenter from the currently loaded, filtered comments. The owner is excluded.</p>
        <label>
          Required keyword
          <input
            value={keyword}
            onChange={e => {
              setKeyword(e.target.value);
              giveaway.reset();
            }}
          />
        </label>
        <button type="button" disabled={!query.data?.threads.length || query.isFetching || giveaway.isPending} onClick={() => giveaway.mutate()}>
          Pick locally
        </button>
        {giveaway.isError ? (
          <QueryError error={giveaway.error} retry={() => giveaway.mutate()} />
        ) : giveaway.data ? (
          <div role="status">
            <p>
              Eligible: {format(giveaway.data.eligible)} · Seed: {giveaway.data.seed}
            </p>
            {giveaway.data.winners.length ? (
              giveaway.data.winners.map(w => (
                <p key={w.commentId}>
                  Winner: {w.author} · {w.text}
                </p>
              ))
            ) : (
              <p>No eligible commenters.</p>
            )}
          </div>
        ) : null}
      </section>
    </>
  );
}
export function Comments() {
  const [tab, setTab] = useState('Comments');
  return (
    <div className="research-page">
      <PageHeader title="Comments" description="Read channel comments and returned replies. Keep text snippets locally and draw giveaway winners." />
      <Tabs labels={['Comments', 'Local snippets']} value={tab} onChange={setTab} />
      {tab === 'Local snippets' ? <Templates /> : <OwnedPage>{id => <ChannelComments key={id} id={id} />}</OwnedPage>}
    </div>
  );
}
