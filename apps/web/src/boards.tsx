import { Spinner } from '@/components/ui/spinner';
import { Inbox } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia, EmptyDescription } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
    <Card>
      <CardHeader>
        <CardTitle>Board items</CardTitle>
      </CardHeader>
      <CardContent className="flex w-full flex-col gap-4">
        <form
          className="w-full"
          onSubmit={e => {
            e.preventDefault();
            change.mutate({ path: `/boards/id/${id}/items`, method: 'POST', body: { kind, ref: { text } } });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel id="boards-1-label" htmlFor="boards-1">
                Kind
              </FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                className="flex-wrap"
                id="boards-1"
                aria-labelledby="boards-1-label"
                value={kind}
                onValueChange={value => {
                  if (value) {
                    setKind(value);
                  }
                }}
              >
                {['note', 'title', 'keyword'].map(k => (
                  <ToggleGroupItem key={k} value={k}>
                    {k}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel id="boards-2-label" htmlFor="boards-2">
                Text
              </FieldLabel>
              <Input id="boards-2" required value={text} onChange={e => setText(e.target.value)} />
            </Field>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? <Spinner data-icon="inline-start" /> : null}
              Add local item
            </Button>
          </FieldGroup>
        </form>
        {change.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{change.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <DataSection query={query}>
          {data =>
            !data.length ? (
              <Empty className="w-full border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox />
                  </EmptyMedia>
                  <EmptyTitle>No results</EmptyTitle>
                  <EmptyDescription>No items. Save videos from the library or Outliers.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              data.map(item => (
                <article key={item.id} className="flex w-full flex-col items-start gap-3 rounded-lg border p-4">
                  <h3 className="text-base font-semibold">
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
                    className="w-full"
                    onSubmit={e => {
                      e.preventDefault();
                      const note = new FormData(e.currentTarget).get('note');
                      change.mutate({ path: `/boards/items/${item.id}`, method: 'PUT', body: { note } });
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor={`board-note-${item.id}`}>Item note</FieldLabel>
                        <Input id={`board-note-${item.id}`} name="note" defaultValue={item.note || ''} />
                      </Field>
                      <Button type="submit" disabled={change.isPending}>
                        Save note locally
                      </Button>
                    </FieldGroup>
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
      </CardContent>
    </Card>
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
        className="w-full"
        onSubmit={e => {
          e.preventDefault();
          change.mutate({ path: `/boards/${id}`, method: 'POST', body: { name: name.trim() } });
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel id="boards-4-label" htmlFor="boards-4">
              Board name
            </FieldLabel>
            <Input id="boards-4" required pattern=".*\S.*" value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? <Spinner data-icon="inline-start" /> : null}
            Create board
          </Button>
        </FieldGroup>
      </form>
      {change.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{change.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <DataSection query={query}>
        {data =>
          !data.length ? (
            <Empty className="w-full border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>No boards. Create one to collect videos and notes.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <FieldGroup>
                <Field>
                  <FieldLabel id="boards-5-label" htmlFor="boards-5">
                    Board
                  </FieldLabel>
                  <Select value={active ? String(active.id) : undefined} onValueChange={value => select(Number(value))}>
                    <SelectTrigger id="boards-5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {data.map(b => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name} ({format(b.items)})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
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
      <Card>
        <CardHeader>
          <CardTitle>{editing ? 'Edit blueprint' : 'New blueprint'}</CardTitle>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-4">
          <form
            className="w-full"
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
            <FieldGroup>
              {(['title', 'idea', 'audience', 'titles', 'thumbnail_notes', 'proof', 'outline'] as const).map(k => (
                <FieldGroup key={k}>
                  <Field>
                    <FieldLabel htmlFor={`blueprint-${k}`}>
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
                    </FieldLabel>
                    <Textarea id={`blueprint-${k}`} required={k === 'title'} value={draft[k]} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} />
                  </Field>
                </FieldGroup>
              ))}
              <Field>
                <FieldLabel id="boards-7-label" htmlFor="boards-7">
                  Status
                </FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="flex-wrap"
                  id="boards-7"
                  aria-labelledby="boards-7-label"
                  value={draft.status}
                  onValueChange={value => {
                    if (value) {
                      setDraft(d => ({ ...d, status: value }));
                    }
                  }}
                >
                  {['idea', 'scripted', 'produced', 'published'].map(s => (
                    <ToggleGroupItem key={s} value={s}>
                      {s}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Button type="submit" disabled={change.isPending}>
                {change.isPending ? <Spinner data-icon="inline-start" /> : null}
                Save local blueprint
              </Button>
              {editing ? (
                <Button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setDraft(blank);
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
            </FieldGroup>
          </form>
          {change.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{change.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
      <DataSection query={query}>
        {data =>
          !data.length ? (
            <Empty className="w-full border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>No blueprints.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            data.map(b => (
              <Card key={b.id}>
                <CardHeader>
                  <CardTitle>
                    {b.title} · {b.status}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex w-full flex-col gap-4">
                  <p>Idea: {b.idea || '—'}</p>
                  <p>Audience: {b.audience || '—'}</p>
                  <p>Titles: {b.titles.join(' | ') || '—'}</p>
                  <p>Thumbnail: {b.thumbnail_notes || '—'}</p>
                  <p>Proof: {b.proof || '—'}</p>
                  <pre className="w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">{b.outline}</pre>
                  <CopyText text={[b.title, b.idea, b.audience, ...b.titles, b.thumbnail_notes, b.proof, b.outline].join('\n')} />
                  <Button
                    type="button"
                    onClick={() => {
                      setEditing(b.id);
                      setDraft({ ...b, titles: b.titles.join(' | ') });
                    }}
                  >
                    Edit blueprint
                  </Button>
                  <ConfirmDelete
                    label={`Delete blueprint ${b.title}`}
                    disabled={change.isPending}
                    onConfirm={() => change.mutate({ path: `/blueprints/id/${b.id}`, method: 'DELETE' })}
                  />
                </CardContent>
              </Card>
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
      <h2 className="text-xl font-semibold">Saved video records</h2>
      {change.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{change.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <DataSection query={query}>
        {data =>
          !data.length ? (
            <Empty className="w-full border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>No saved video records. Board video references appear under Boards.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            data.map(item => (
              <Card key={item.id}>
                <CardHeader>
                  <h3 className="font-heading text-base leading-snug font-medium">{item.title}</h3>
                </CardHeader>
                <CardContent className="flex w-full flex-col gap-4">
                  <pre className="w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">{item.body}</pre>
                  <CopyText text={item.body} />
                  <ConfirmDelete
                    label="Delete saved record"
                    disabled={change.isPending}
                    onConfirm={() => change.mutate({ path: `/saved/id/${item.id}`, method: 'DELETE' })}
                  />
                </CardContent>
              </Card>
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
    <>
      <PageHeader title="Boards & blueprints" description="Collect references and plan ideas in the local database." />
      <Tabs labels={['Boards', 'Blueprints', 'Saved videos']} value={tab} onChange={setTab} />
      <OwnedPage>
        {id => (tab === 'Boards' ? <BoardList key={id} id={id} /> : tab === 'Blueprints' ? <Blueprints key={id} id={id} /> : <Saved key={id} id={id} />)}
      </OwnedPage>
    </>
  );
}
