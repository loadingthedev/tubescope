import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronRight, Inbox } from 'lucide-react';
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia, EmptyDescription } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { PackagingAnalysis, ChapterAnalysis, TagAnalysis, StagedEdit, PlaylistSummary } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, Table, Tabs } from './components/research';
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
    <Card>
      <CardHeader>
        <CardTitle>{kind === 'Tags' ? 'Tag candidates & checks' : `${kind} analyzer`}</CardTitle>
      </CardHeader>
      <CardContent className="flex w-full flex-col gap-4">
        <form
          className="w-full"
          onSubmit={e => {
            e.preventDefault();
            analyze.mutate();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel id="packaging-1-label" htmlFor="packaging-1">
                {kind === 'Tags' ? 'Title and description context' : kind}
              </FieldLabel>
              <Textarea
                id="packaging-1"
                rows={6}
                required
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  analyze.reset();
                }}
              />
            </Field>
            {kind !== 'Chapters' ? (
              <Field>
                <FieldLabel id="packaging-2-label" htmlFor="packaging-2">
                  Target keyword
                </FieldLabel>
                <Input
                  id="packaging-2"
                  value={keyword}
                  onChange={e => {
                    setKeyword(e.target.value);
                    analyze.reset();
                  }}
                />
              </Field>
            ) : null}
            <Button type="submit" disabled={analyze.isPending}>
              {analyze.isPending ? <Spinner data-icon="inline-start" /> : null}

              {analyze.isPending ? 'Analyzing…' : 'Analyze'}
            </Button>
          </FieldGroup>
        </form>
        {analyze.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{analyze.error.message}</AlertDescription>
            <Button variant="outline" size="sm" onClick={() => analyze.mutate()}>
              Try again
            </Button>
          </Alert>
        ) : null}
        {data ? <AnalysisResult data={data} /> : <p>Enter text and run the analyzer. No YouTube changes are made.</p>}
      </CardContent>
    </Card>
  );
}
function AnalysisResult({ data }: { data: PackagingAnalysis | ChapterAnalysis | TagAnalysis }) {
  return (
    <div className="flex flex-col gap-4">
      {'checks' in data ? (
        <>
          <h3 className="text-base font-semibold">Checklist score: {format(data.score)}/100</h3>
          <p>{data.note || 'Heuristic checks. These do not predict performance.'}</p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
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
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {data.errors.map(error => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <pre className="w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">{data.formatted}</pre>
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
          <ul className="flex list-disc flex-col gap-2 pl-5">
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
        <Card>
          <CardHeader>
            <CardTitle>Playlists overview</CardTitle>
          </CardHeader>
          <CardContent className="flex w-full flex-col gap-4">
            {!data.length ? (
              <Empty className="w-full border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox />
                  </EmptyMedia>
                  <EmptyTitle>No results</EmptyTitle>
                  <EmptyDescription>No playlists found.</EmptyDescription>
                </EmptyHeader>
              </Empty>
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
          </CardContent>
        </Card>
      )}
    </DataSection>
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>Staged-edit history</CardTitle>
      </CardHeader>
      <CardContent className="flex w-full flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel id="packaging-3-label" htmlFor="packaging-3">
              Status
            </FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              className="flex-wrap"
              id="packaging-3"
              aria-labelledby="packaging-3-label"
              value={status}
              onValueChange={value => {
                if (value) {
                  setStatus(value);
                }
              }}
            >
              {['staged', 'applied', 'failed', 'discarded'].map(s => (
                <ToggleGroupItem key={s} value={s}>
                  {s}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
        <DataSection query={staged}>
          {data =>
            !data.length ? (
              <Empty className="w-full border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox />
                  </EmptyMedia>
                  <EmptyTitle>No results</EmptyTitle>
                  <EmptyDescription>No edits with this status.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              data.map(edit => (
                <article key={edit.id} className="flex w-full flex-col items-start gap-3 rounded-lg border p-4">
                  <h3 className="text-base font-semibold">
                    {edit.video_title || edit.video_id} · {edit.field}
                  </h3>
                  <p>
                    {timestamp(edit.created_at)} · {edit.status}
                  </p>
                  <details className="group w-full rounded-lg border bg-card px-4 py-3 text-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-90" />
                      Previous text
                    </summary>
                    <pre className="w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">{edit.old_value || '—'}</pre>
                  </details>
                  <pre className="w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">{edit.new_value}</pre>
                  <CopyText text={edit.new_value} />
                </article>
              ))
            )
          }
        </DataSection>
      </CardContent>
    </Card>
  );
}
export function Packaging() {
  const [tab, setTab] = useState('Title');
  return (
    <>
      <PageHeader title="Packaging" description="Non-AI title, description, chapter and tag checks. Copy local drafts for manual use." />
      <Tabs labels={['Title', 'Description', 'Chapters', 'Tags', 'Playlists', 'Staged history']} value={tab} onChange={setTab} />
      {tab === 'Playlists' || tab === 'Staged history' ? (
        <OwnedPage>{(id, authorized) => <ChannelPackaging key={id} id={id} authorized={authorized} tab={tab} />}</OwnedPage>
      ) : (
        <Analyzer key={tab} kind={tab} />
      )}
    </>
  );
}
