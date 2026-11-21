import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronRight, Inbox } from 'lucide-react';
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia, EmptyDescription } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommentsResponse, CommentTemplate, GiveawayResult, LocalChange } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, Tabs } from './components/research';
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
    <Card>
      <CardHeader>
        <CardTitle>Local text snippets</CardTitle>
      </CardHeader>
      <CardContent className="flex w-full flex-col gap-4">
        <form
          className="w-full"
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
          <FieldGroup>
            <Field>
              <FieldLabel id="comments-1-label" htmlFor="comments-1">
                Name
              </FieldLabel>
              <Input id="comments-1" required value={name} onChange={e => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel id="comments-2-label" htmlFor="comments-2">
                Snippet
              </FieldLabel>
              <Textarea id="comments-2" required value={body} onChange={e => setBody(e.target.value)} />
            </Field>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? <Spinner data-icon="inline-start" /> : null}
              Save local snippet
            </Button>
            {editing ? (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setName('');
                  setBody('');
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
        <DataSection query={templates}>
          {data =>
            !data.length ? (
              <Empty className="w-full border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox />
                  </EmptyMedia>
                  <EmptyTitle>No results</EmptyTitle>
                  <EmptyDescription>No snippets saved.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              data.map(t => (
                <article key={t.id} className="flex w-full flex-col items-start gap-3 rounded-lg border p-4">
                  <h3 className="text-base font-semibold">{t.name}</h3>
                  <pre className="w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">{t.body}</pre>
                  <CopyText text={t.body} />
                  <Button
                    type="button"
                    onClick={() => {
                      setEditing(t.id);
                      setName(t.name);
                      setBody(t.body);
                    }}
                  >
                    Edit snippet
                  </Button>
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
      </CardContent>
    </Card>
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
      <div className="flex flex-col gap-4">
        <FieldGroup className="flex-row flex-wrap items-end gap-4">
          <Field className="w-auto">
            <FieldLabel id="comments-3-label" htmlFor="comments-3">
              Filter
            </FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              className="flex-wrap"
              id="comments-3"
              aria-labelledby="comments-3-label"
              value={filters.filter}
              onValueChange={value => {
                if (value) {
                  filter('filter', value);
                }
              }}
            >
              {['all', 'unanswered', 'questions', 'mentions', 'top'].map(f => (
                <ToggleGroupItem key={f} value={f}>
                  {f}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field className="w-auto min-w-56">
            <FieldLabel id="comments-4-label" htmlFor="comments-4">
              Comment text
            </FieldLabel>
            <Input id="comments-4" type="search" value={filters.q} onChange={e => filter('q', e.target.value)} />
          </Field>
          <Field className="w-auto">
            <FieldLabel id="comments-5-label" htmlFor="comments-5">
              Order
            </FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              className="flex-wrap"
              id="comments-5"
              aria-labelledby="comments-5-label"
              value={filters.order}
              onValueChange={value => {
                if (value) {
                  filter('order', value);
                }
              }}
            >
              <ToggleGroupItem value="time">Newest</ToggleGroupItem>
              <ToggleGroupItem value="relevance">Relevance</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </FieldGroup>
        <form
          onSubmit={e => {
            e.preventDefault();
            filter('video', video.trim());
          }}
        >
          <FieldGroup className="flex-row flex-wrap items-end gap-3">
            <Field className="w-auto max-w-md min-w-72 flex-1">
              <FieldLabel id="comments-6-label" htmlFor="comments-6">
                Video ID (blank = channel)
              </FieldLabel>
              <Input id="comments-6" value={video} onChange={e => setVideo(e.target.value)} />
            </Field>
            <Button type="submit">Load video comments</Button>
          </FieldGroup>
        </form>
      </div>
      <DataSection query={query}>
        {data => (
          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardContent className="flex w-full flex-col gap-4">
              <p>
                {format(data.shown)} shown / {format(data.total)} fetched (up to three pages). Unanswered reflects the replies returned by YouTube.
              </p>
              {!data.threads.length ? (
                <Empty className="w-full border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox />
                    </EmptyMedia>
                    <EmptyTitle>No results</EmptyTitle>
                    <EmptyDescription>No matching comments.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                data.threads.map(t => (
                  <article key={t.id} className="flex w-full flex-col items-start gap-3 rounded-lg border p-4">
                    <h3 className="text-base font-semibold">
                      {t.author} · {format(t.likes)} likes
                    </h3>
                    <p className="whitespace-pre-wrap break-words">{t.text}</p>
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
                      <details className="group w-full rounded-lg border bg-card px-4 py-3 text-sm">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
                          <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-90" />
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
            </CardContent>
          </Card>
        )}
      </DataSection>
      <Card>
        <CardHeader>
          <CardTitle>Giveaway picker · local draw</CardTitle>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-4">
          <p>Draws one unique commenter from the currently loaded, filtered comments. The owner is excluded.</p>
          <FieldGroup>
            <Field>
              <FieldLabel id="comments-7-label" htmlFor="comments-7">
                Required keyword
              </FieldLabel>
              <Input
                id="comments-7"
                value={keyword}
                onChange={e => {
                  setKeyword(e.target.value);
                  giveaway.reset();
                }}
              />
            </Field>
          </FieldGroup>
          <Button type="button" disabled={!query.data?.threads.length || query.isFetching || giveaway.isPending} onClick={() => giveaway.mutate()}>
            {giveaway.isPending ? <Spinner data-icon="inline-start" /> : null}
            Pick locally
          </Button>
          {giveaway.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{giveaway.error.message}</AlertDescription>
              <Button variant="outline" size="sm" onClick={() => giveaway.mutate()}>
                Try again
              </Button>
            </Alert>
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
                <Empty className="w-full border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox />
                    </EmptyMedia>
                    <EmptyTitle>No results</EmptyTitle>
                    <EmptyDescription>No eligible commenters.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
export function Comments() {
  const [tab, setTab] = useState('Comments');
  return (
    <>
      <PageHeader title="Comments" description="Read channel comments and returned replies. Keep text snippets locally and draw giveaway winners." />
      <Tabs labels={['Comments', 'Local snippets']} value={tab} onChange={setTab} />
      {tab === 'Local snippets' ? <Templates /> : <OwnedPage>{id => <ChannelComments key={id} id={id} />}</OwnedPage>}
    </>
  );
}
