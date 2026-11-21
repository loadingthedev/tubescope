import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { ChevronRight, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RanksResponse, RankRemoveResponse, RankCheckResponse, RankKeyword } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, ChannelSelect, useOwnedChannel, Table } from './components/research';
import { LineChart } from './components/line-chart';
import { format } from './components/format';

function KeywordDetail({ keyword }: { keyword: RankKeyword }) {
  return (
    <details className="group w-full rounded-lg border bg-card px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-90" />
        History & top results
      </summary>
      <LineChart
        label={`${keyword.keyword} search position (lower is better)`}
        reversed
        points={keyword.history.filter(p => p.position !== null).map(p => ({ day: p.day, value: p.position as number }))}
      />
      <p className="text-sm text-muted-foreground">Lower position is better. Unranked days are omitted from the chart; see all readings below.</p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        {keyword.history.map(p => (
          <li key={p.day}>
            {p.day}: {p.position === null ? 'Outside top 50' : format(p.position)}
          </li>
        ))}
      </ul>
      <h3 className="text-base font-semibold">Top search results</h3>
      {keyword.top.length ? (
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          {keyword.top.map(v => (
            <li key={v.id}>
              <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noreferrer">
                {v.title}
              </a>{' '}
              — {v.channel}
            </li>
          ))}
        </ol>
      ) : (
        <Empty className="w-full border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>No results</EmptyTitle>
            <EmptyDescription>No search results recorded yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </details>
  );
}
function ChannelRanks({ channelId }: { channelId: string }) {
  const client = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [confirm, setConfirm] = useState<number | null>(null);
  const list = useQuery({
    queryKey: ['ranks', channelId],
    queryFn: ({ signal }) => getJson<RanksResponse>(`/ranks?${new URLSearchParams({ channelId })}`, signal),
  });
  function refresh() {
    void client.invalidateQueries({ queryKey: ['ranks'] });
    void client.invalidateQueries({ queryKey: ['quota'] });
  }
  const add = useMutation({
    mutationFn: () => mutateJson<RanksResponse>('/ranks', 'POST', { channelId, keyword: keyword.trim() }),
    onSuccess: () => {
      setKeyword('');
      toast.success('Keyword saved. A history reading confirms that the initial search completed.');
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => mutateJson<RankRemoveResponse>(`/ranks/${id}`, 'DELETE'),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
  });
  const check = useMutation({ mutationFn: () => mutateJson<RankCheckResponse>('/ranks/check', 'POST', {}), onSuccess: refresh });
  return (
    <>
      <form
        className="w-full"
        onSubmit={e => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <FieldGroup className="flex-row flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel htmlFor="ranks-1">Keyword to track</FieldLabel>
            <Input id="ranks-1" value={keyword} onChange={e => setKeyword(e.target.value)} required minLength={2} />
          </Field>
          <Button type="submit" disabled={add.isPending || keyword.trim().length < 2}>
            {add.isPending ? <Spinner data-icon="inline-start" /> : null}
            {add.isPending ? 'Tracking…' : 'Track'}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-sm text-muted-foreground">
        Adding stores a local keyword and attempts one search check (100 quota units). Daily checks cost 100 units per keyword. Search calls have a separate
        100/day limit.
      </p>
      {add.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{add.error.message}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => add.mutate()}>
            Try again
          </Button>
        </Alert>
      ) : null}
      <Button type="button" variant="outline" disabled={check.isPending || add.isPending} onClick={() => check.mutate()}>
        {check.isPending ? <Spinner data-icon="inline-start" /> : null}
        {check.isPending ? 'Checking…' : 'Check now — all channels'}
      </Button>
      <p className="text-sm text-muted-foreground">Check now checks all tracked keywords across owned channels.</p>
      {check.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{check.error.message}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => check.mutate()}>
            Try again
          </Button>
        </Alert>
      ) : null}
      {check.data ? (
        <ul aria-label="Check results">
          {check.data.results.map(r => (
            <li key={r.keyword}>
              {r.keyword}: {r.error || (r.skipped ? `Skipped: ${r.skipped}` : r.position === null ? 'Outside top 50' : `Position ${format(r.position)}`)}
            </li>
          ))}
        </ul>
      ) : null}
      {remove.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{remove.error.message}</AlertDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm !== null) remove.mutate(confirm);
            }}
          >
            Try again
          </Button>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Tracked keywords</CardTitle>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-4">
          {list.isPending ? (
            <div role="status" className="flex w-full flex-col gap-2">
              <span className="sr-only">Loading keywords…</span>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : list.isError ? (
            <QueryError error={list.error} retry={() => void list.refetch()} />
          ) : !list.data.keywords.length ? (
            <Empty className="w-full border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>No keywords tracked for this channel yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table caption="Tracked search positions">
                <thead>
                  <tr>
                    {['Keyword', 'Position', '7-day change', 'Your video', 'History / top results', 'Local actions'].map(c => (
                      <th scope="col" key={c}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.data.keywords.map(k => (
                    <tr key={k.id}>
                      <td>
                        {k.keyword}
                        <small className="block text-xs text-muted-foreground">{k.country}</small>
                      </td>
                      <td>{!k.history.length ? 'Not checked' : k.position === null ? '50+' : format(k.position)}</td>
                      <td>{k.change7d === null ? '—' : `${k.change7d > 0 ? '+' : ''}${format(k.change7d)}`}</td>
                      <td>{k.bestVideo || '—'}</td>
                      <td>
                        <KeywordDetail keyword={k} />
                      </td>
                      <td>
                        {confirm === k.id ? (
                          <>
                            <span>Remove “{k.keyword}” and its local history?</span>
                            <Button type="button" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate(k.id)}>
                              {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
                              Confirm remove
                            </Button>
                            <Button type="button" variant="link" disabled={remove.isPending} onClick={() => setConfirm(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button type="button" variant="link" onClick={() => setConfirm(k.id)}>
                            Remove
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="text-sm text-muted-foreground">{list.data.keywords[0].note} Positive 7-day change means an improvement.</p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
export function Ranks() {
  const channel = useOwnedChannel();
  return (
    <>
      <PageHeader title="Rank tracker" description="Your position in YouTube search, checked every morning. Local tracking for the active owned channel." />
      {channel.channels.isPending ? (
        <div role="status" className="flex w-full flex-col gap-2">
          <span className="sr-only">Loading owned channels…</span>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : !channel.current ? (
        <p>Add an owned channel to track keywords.</p>
      ) : (
        <>
          <ChannelSelect channel={channel} />
          <ChannelRanks key={channel.current.id} channelId={channel.current.id} />
        </>
      )}
    </>
  );
}
