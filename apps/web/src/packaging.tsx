import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { PackagingAnalysis, ChapterAnalysis, TagAnalysis, StagedEdit, PlaylistSummary } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, Table, Tabs } from './components/research';
import { CopyText, DataSection, OwnedPage } from './components/data-section';
import { format, timestamp } from './components/format';

function Analyzer({ kind }: { kind: string }) {
  const [text, setText] = useState('');
  const [keyword, setKeyword] = useState('');
  const analyze = useMutation({
    mutationFn: () =>
      mutateJson<PackagingAnalysis | ChapterAnalysis | TagAnalysis>(
        `/packaging/${kind === 'Title' ? 'title/analyze' : kind === 'Description' ? 'description/analyze' : kind === 'Chapters' ? 'chapters/validate' : 'tags'}`,
        'POST',
        { title: text, description: text, text, keyword }
      ),
  });
  const data = analyze.data;
  return (
    <section className="dashboard-card">
      <h2>{kind === 'Tags' ? 'Tag candidates & checks' : `${kind} analyzer`}</h2>
      <form
        onSubmit={e => {
          e.preventDefault();
          analyze.mutate();
        }}
      >
        <label>
          {kind === 'Tags' ? 'Title and description context' : kind}
          <textarea
            rows={6}
            required
            value={text}
            onChange={e => {
              setText(e.target.value);
              analyze.reset();
            }}
          />
        </label>
        {kind !== 'Chapters' ? (
          <label>
            Target keyword
            <input
              value={keyword}
              onChange={e => {
                setKeyword(e.target.value);
                analyze.reset();
              }}
            />
          </label>
        ) : null}
        <button type="submit" disabled={analyze.isPending}>
          {analyze.isPending ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>
      {analyze.isError ? <QueryError error={analyze.error} retry={() => analyze.mutate()} /> : null}
      {data ? <AnalysisResult data={data} /> : <p>Enter text and run the analyzer. No YouTube changes are made.</p>}
    </section>
  );
}
function AnalysisResult({ data }: { data: PackagingAnalysis | ChapterAnalysis | TagAnalysis }) {
  return (
    <div>
      {' '}
      {'checks' in data ? (
        <>
          <h3>Checklist score: {format(data.score)}/100</h3>
          <p>{data.note || 'Heuristic checks. These do not predict performance.'}</p>
          <ul>
            {data.checks.map(c => (
              <li key={c.name}>
                <strong>
                  {c.pass ? 'Pass' : 'Check'}: {c.name}
                </strong>{' '}
                · {c.detail}
              </li>
            ))}
          </ul>
        </>
      ) : 'chapters' in data ? (
        <>
          <p>{data.valid ? 'Valid chapter structure.' : 'Chapter structure needs changes.'}</p>
          <ul>
            {data.errors.map(error => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <pre>{data.formatted}</pre>
          <CopyText text={data.formatted} />
        </>
      ) : (
        <>
          <p>{data.note}</p>
          <p>
            {format(data.charactersUsed)} / {format(data.limit)} characters
          </p>
          <p>{data.tags.join(', ') || 'No tag candidates.'}</p>
          <CopyText text={data.tags.join(', ')} />
          <ul>
            {data.excluded.map(t => (
              <li key={t.tag}>
                {t.tag}: {t.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
function ChannelPackaging({ id, authorized, tab }: { id: string; authorized: boolean; tab: string }) {
  const [status, setStatus] = useState('staged');
  const playlists = useQuery({
    queryKey: ['playlists', id, authorized],
    queryFn: ({ signal }) => getJson<PlaylistSummary[]>(`/channels/${id}/playlists?owned=${authorized ? 1 : 0}`, signal),
    enabled: tab === 'Playlists',
  });
  const staged = useQuery({
    queryKey: ['staged', id, status],
    queryFn: ({ signal }) => getJson<StagedEdit[]>(`/packaging/staged/${id}?status=${status}`, signal),
    enabled: tab === 'Staged history',
  });
  return tab === 'Playlists' ? (
    <DataSection query={playlists}>
      {data => (
        <section className="dashboard-card">
          <h2>Playlists overview</h2>
          {!data.length ? (
            <p>No playlists found.</p>
          ) : (
            <Table caption="Playlists">
              <thead>
                <tr>
                  {['Playlist', 'Videos', 'Privacy', 'Description'].map(c => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(p => (
                  <tr key={p.id}>
                    <th scope="row">
                      <a href={`https://www.youtube.com/playlist?list=${encodeURIComponent(p.id)}`} target="_blank" rel="noreferrer">
                        {p.title}
                      </a>
                    </th>
                    <td>{format(p.count)}</td>
                    <td>{p.privacy || 'Public data'}</td>
                    <td>{p.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      )}
    </DataSection>
  ) : (
    <section className="dashboard-card">
      <h2>Staged-edit history</h2>
      <label>
        Status
        <select value={status} onChange={e => setStatus(e.target.value)}>
          {['staged', 'applied', 'failed', 'discarded'].map(s => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <DataSection query={staged}>
        {data =>
          !data.length ? (
            <p>No edits with this status.</p>
          ) : (
            data.map(edit => (
              <article key={edit.id}>
                <h3>
                  {edit.video_title || edit.video_id} · {edit.field}
                </h3>
                <p>
                  {timestamp(edit.created_at)} · {edit.status}
                </p>
                <details>
                  <summary>Previous text</summary>
                  <pre>{edit.old_value || '—'}</pre>
                </details>
                <pre>{edit.new_value}</pre>
                <CopyText text={edit.new_value} />
              </article>
            ))
          )
        }
      </DataSection>
    </section>
  );
}
export function Packaging() {
  const [tab, setTab] = useState('Title');
  return (
    <div className="research-page">
      <PageHeader title="Packaging" description="Non-AI title, description, chapter and tag checks. Copy local drafts for manual use." />
      <Tabs labels={['Title', 'Description', 'Chapters', 'Tags', 'Playlists', 'Staged history']} value={tab} onChange={setTab} />
      {tab === 'Playlists' || tab === 'Staged history' ? (
        <OwnedPage>{(id, authorized) => <ChannelPackaging key={id} id={id} authorized={authorized} tab={tab} />}</OwnedPage>
      ) : (
        <Analyzer key={tab} kind={tab} />
      )}
    </div>
  );
}
