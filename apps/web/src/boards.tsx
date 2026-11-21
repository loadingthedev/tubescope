import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Board, BoardItem, Blueprint, SavedItem, LocalChange } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, Tabs } from './components/research';
import { ConfirmDelete, CopyText, DataSection, OwnedPage } from './components/data-section';
import { format } from './components/format';
function useLocalChange() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PUT' | 'DELETE'; body?: unknown }) => mutateJson<LocalChange>(path, method, body),
    onSuccess: () => Promise.all(['boards', 'board-items', 'blueprints', 'saved'].map(key => client.invalidateQueries({ queryKey: [key] }))),
  });
}
function BoardItems({ id }: { id: number }) {
  const query = useQuery({ queryKey: ['board-items', id], queryFn: ({ signal }) => getJson<BoardItem[]>(`/boards/id/${id}/items`, signal) });
  const [text, setText] = useState('');
  const [kind, setKind] = useState('note');
  const change = useLocalChange();
  return (
    <section className="dashboard-card">
      <h2>Board items</h2>
      <form
        onSubmit={e => {
          e.preventDefault();
          change.mutate({ path: `/boards/id/${id}/items`, method: 'POST', body: { kind, ref: { text } } });
        }}
      >
        <label>
          Kind
          <select value={kind} onChange={e => setKind(e.target.value)}>
            {['note', 'title', 'keyword'].map(k => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Text
          <input required value={text} onChange={e => setText(e.target.value)} />
        </label>
        <button type="submit" disabled={change.isPending}>
          Add local item
        </button>
      </form>
      {change.isError ? <p role="alert">{change.error.message}</p> : null}
      <DataSection query={query}>
        {data =>
          !data.length ? (
            <p>No items. Save videos from the library or Outliers.</p>
          ) : (
            data.map(item => (
              <article key={item.id}>
                <h3>
                  {item.kind === 'video' && item.ref.id ? (
                    <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.ref.id)}`} target="_blank" rel="noreferrer">
                      {item.ref.title || item.ref.id}
                    </a>
                  ) : (
                    item.ref.text || item.ref.title || JSON.stringify(item.ref)
                  )}
                </h3>
                <p>
                  {item.kind} · {item.note}
                </p>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const note = new FormData(e.currentTarget).get('note');
                    change.mutate({ path: `/boards/items/${item.id}`, method: 'PUT', body: { note } });
                  }}
                >
                  <label>
                    Item note
                    <input name="note" defaultValue={item.note || ''} />
                  </label>
                  <button type="submit" disabled={change.isPending}>
                    Save note locally
                  </button>
                </form>
                <ConfirmDelete
                  label="Remove item"
                  disabled={change.isPending}
                  onConfirm={() => change.mutate({ path: `/boards/items/${item.id}`, method: 'DELETE' })}
                />
              </article>
            ))
          )
        }
      </DataSection>
    </section>
  );
}
function BoardList({ id }: { id: string }) {
  const [name, setName] = useState('');
  const [selected, select] = useState(0);
  const query = useQuery({ queryKey: ['boards', id], queryFn: ({ signal }) => getJson<Board[]>(`/boards/${id}`, signal) });
  const change = useLocalChange();
  const active = query.data?.find(b => b.id === selected) || query.data?.[0];
  return (
    <>
      <form
        onSubmit={e => {
          e.preventDefault();
          change.mutate({ path: `/boards/${id}`, method: 'POST', body: { name: name.trim() } });
        }}
      >
        <label>
          Board name
          <input required pattern=".*\S.*" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={change.isPending}>
          Create board
        </button>
      </form>
      {change.isError ? <p role="alert">{change.error.message}</p> : null}
      <DataSection query={query}>
        {data =>
          !data.length ? (
            <p>No boards. Create one to collect videos and notes.</p>
          ) : (
            <>
              <label>
                Board
                <select value={active?.id} onChange={e => select(Number(e.target.value))}>
                  {data.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({format(b.items)})
                    </option>
                  ))}
                </select>
              </label>
              {active ? (
                <>
                  <ConfirmDelete
                    label={`Delete board ${active.name} and its items`}
                    disabled={change.isPending}
                    onConfirm={() => change.mutate({ path: `/boards/id/${active.id}`, method: 'DELETE' })}
                  />
                  <BoardItems key={active.id} id={active.id} />
                </>
              ) : null}
            </>
          )
        }
      </DataSection>
    </>
  );
}
const blank = { title: '', idea: '', audience: '', titles: '', thumbnail_notes: '', proof: '', outline: '', status: 'idea' };
function Blueprints({ id }: { id: string }) {
  const query = useQuery({ queryKey: ['blueprints', id], queryFn: ({ signal }) => getJson<Blueprint[]>(`/blueprints/${id}`, signal) });
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState(blank);
  const change = useLocalChange();
  return (
    <>
      <section className="dashboard-card">
        <h2>{editing ? 'Edit blueprint' : 'New blueprint'}</h2>
        <form
          onSubmit={e => {
            e.preventDefault();
            change.mutate(
              {
                path: editing ? `/blueprints/id/${editing}` : `/blueprints/${id}`,
                method: editing ? 'PUT' : 'POST',
                body: {
                  ...draft,
                  titles: draft.titles
                    .split('|')
                    .map(s => s.trim())
                    .filter(Boolean),
                },
              },
              {
                onSuccess: () => {
                  setDraft(blank);
                  setEditing(null);
                },
              }
            );
          }}
        >
          {(['title', 'idea', 'audience', 'titles', 'thumbnail_notes', 'proof', 'outline'] as const).map(k => (
            <label key={k}>
              {
                {
                  title: 'Working title',
                  idea: 'Idea',
                  audience: 'Audience',
                  titles: 'Title options (separate with |)',
                  thumbnail_notes: 'Thumbnail notes',
                  proof: 'Proof',
                  outline: 'Outline',
                }[k]
              }
              <textarea required={k === 'title'} value={draft[k]} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} />
            </label>
          ))}
          <label>
            Status
            <select value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
              {['idea', 'scripted', 'produced', 'published'].map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={change.isPending}>
            Save local blueprint
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft(blank);
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </form>
        {change.isError ? <p role="alert">{change.error.message}</p> : null}
      </section>
      <DataSection query={query}>
        {data =>
          !data.length ? (
            <p>No blueprints.</p>
          ) : (
            data.map(b => (
              <section className="dashboard-card" key={b.id}>
                <h2>
                  {b.title} · {b.status}
                </h2>
                <p>Idea: {b.idea || '—'}</p>
                <p>Audience: {b.audience || '—'}</p>
                <p>Titles: {b.titles.join(' | ') || '—'}</p>
                <p>Thumbnail: {b.thumbnail_notes || '—'}</p>
                <p>Proof: {b.proof || '—'}</p>
                <pre>{b.outline}</pre>
                <CopyText text={[b.title, b.idea, b.audience, ...b.titles, b.thumbnail_notes, b.proof, b.outline].join('\n')} />
                <button
                  type="button"
                  onClick={() => {
                    setEditing(b.id);
                    setDraft({ ...b, titles: b.titles.join(' | ') });
                  }}
                >
                  Edit blueprint
                </button>
                <ConfirmDelete
                  label={`Delete blueprint ${b.title}`}
                  disabled={change.isPending}
                  onConfirm={() => change.mutate({ path: `/blueprints/id/${b.id}`, method: 'DELETE' })}
                />
              </section>
            ))
          )
        }
      </DataSection>
    </>
  );
}
function Saved({ id }: { id: string }) {
  const query = useQuery({ queryKey: ['saved', id], queryFn: ({ signal }) => getJson<SavedItem[]>(`/saved/${id}?kind=video`, signal) });
  const change = useLocalChange();
  return (
    <>
      <h2>Saved video records</h2>
      {change.isError ? <p role="alert">{change.error.message}</p> : null}
      <DataSection query={query}>
        {data =>
          !data.length ? (
            <p>No saved video records. Board video references appear under Boards.</p>
          ) : (
            data.map(item => (
              <section className="dashboard-card" key={item.id}>
                <h3>{item.title}</h3>
                <pre>{item.body}</pre>
                <CopyText text={item.body} />
                <ConfirmDelete
                  label="Delete saved record"
                  disabled={change.isPending}
                  onConfirm={() => change.mutate({ path: `/saved/id/${item.id}`, method: 'DELETE' })}
                />
              </section>
            ))
          )
        }
      </DataSection>
    </>
  );
}
export function Boards() {
  const [tab, setTab] = useState('Boards');
  return (
    <div className="research-page">
      <PageHeader title="Boards & blueprints" description="Collect references and plan ideas in the local database." />
      <Tabs labels={['Boards', 'Blueprints', 'Saved videos']} value={tab} onChange={setTab} />
      <OwnedPage>
        {id => (tab === 'Boards' ? <BoardList key={id} id={id} /> : tab === 'Blueprints' ? <Blueprints key={id} id={id} /> : <Saved key={id} id={id} />)}
      </OwnedPage>
    </div>
  );
}
