import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Spinner } from '@/components/ui/spinner';
import { SearchX } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Channel, ChannelSyncResponse, OAuthUrlResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, Table, useOwnedChannel } from './components/research';
import { format, timestamp } from './components/format';

export function Channels() {
  const channel = useOwnedChannel();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [kind, setKind] = useState('owned');
  const [maxVideos, setMaxVideos] = useState(200);
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const action = useMutation({
    mutationFn: async ({ path, method = 'POST', body }: { path: string; method?: 'POST' | 'DELETE'; body?: unknown }) => {
      if (path === '/oauth/url') {
        const result = await getJson<OAuthUrlResponse>(path);
        window.location.assign(result.url);
        return;
      }
      if (path === '/channels') {
        const result = await mutateJson<Channel>(path, method, body);
        if (result.kind === 'owned') channel.select(result.id);
        setInput('');
        setNotice('');
        toast.success(`Added ${result.title}.`);
      } else if (path.endsWith('/sync')) {
        const result = await mutateJson<ChannelSyncResponse>(path, method, body);
        setNotice(`Synced ${format(result.synced)} videos; ${format(result.metadataChanges)} metadata changes.`);
      } else {
        await mutateJson(path, method, body);
        setNotice('');
        toast.success('Channel updated.');
      }
      setConfirm('');
      await client.invalidateQueries({ queryKey: ['channels'] });
      await client.invalidateQueries({ queryKey: ['quota'] });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    action.mutate({ path: '/channels', body: { input: input.trim(), kind, maxVideos } });
  }
  function rows(title: string, owned: boolean) {
    const items = channel.channels.data?.filter(item => (item.kind === 'owned') === owned) || [];
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {title} ({format(items.length)})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!items.length ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>No {owned ? 'owned' : 'reference'} channels yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table caption={title}>
              <thead>
                <tr>
                  {['Channel', 'Subs', 'Views', 'Videos', 'Synced', 'Status', 'Actions'].map(label => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <th scope="row">
                      <a href={`https://www.youtube.com/channel/${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">
                        {item.title}
                      </a>
                      <small className="block text-xs text-muted-foreground">
                        {item.handle || item.id}
                        {item.oauth_email ? ` · ${item.oauth_email}` : ''}
                      </small>
                    </th>
                    <td className="num">{format(item.subscriber_count)}</td>
                    <td className="num">{format(item.view_count)}</td>
                    <td className="num">{format(item.video_count)}</td>
                    <td>{timestamp(item.last_synced)}</td>
                    <td>
                      <Badge variant="outline">{owned ? (item.authorized ? 'Google-connected' : 'Public only') : 'Competitor'}</Badge>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        {owned ? (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => {
                              channel.select(item.id);
                              void navigate({ to: '/' });
                            }}
                          >
                            Use{channel.current?.id === item.id ? ' (active)' : ''}
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ path: `/channels/${item.id}/sync`, body: { force: true } })}
                        >
                          Sync
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ path: `/channels/${item.id}/kind`, body: { kind: owned ? 'competitor' : 'owned' } })}
                        >
                          {owned ? '→ competitor' : 'Mark as owned'}
                        </Button>
                        {item.authorized ? (
                          <Button variant="outline" size="sm" type="button" disabled={action.isPending} onClick={() => setConfirm(`disconnect:${item.id}`)}>
                            Disconnect
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" type="button" disabled={action.isPending} onClick={() => setConfirm(`remove:${item.id}`)}>
                          Remove
                        </Button>
                      </div>
                      {confirm.endsWith(`:${item.id}`) ? (
                        <div role="group" aria-label="Confirm channel action">
                          <p>
                            {confirm.startsWith('remove:')
                              ? 'Remove this channel and all its local data? YouTube is unchanged.'
                              : 'Remove the stored Google tokens for this channel?'}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            disabled={action.isPending}
                            onClick={() =>
                              action.mutate({
                                path: `/channels/${item.id}${confirm.startsWith('remove:') ? '' : '/disconnect'}`,
                                method: confirm.startsWith('remove:') ? 'DELETE' : 'POST',
                              })
                            }
                          >
                            Confirm {confirm.startsWith('remove:') ? 'remove' : 'disconnect'}
                          </Button>{' '}
                          <Button variant="outline" size="sm" type="button" disabled={action.isPending} onClick={() => setConfirm('')}>
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <PageHeader title="Channels" description="Manage owned workspaces and reference channels in the local database." />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connect a channel you own</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p>Google access is read-only: analytics only; no edits, replies or uploads. Tokens stay in this app’s local database.</p>
            <Button type="button" disabled={action.isPending} onClick={() => action.mutate({ path: '/oauth/url' })}>
              {action.isPending && action.variables?.path === '/oauth/url' ? <Spinner data-icon="inline-start" /> : null}
              Connect with Google
            </Button>
            <p className="text-sm text-muted-foreground">
              Set the Google OAuth client ID and secret in Settings first. Repeat the connection for each owned channel.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Add by ID, handle or URL</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="channels-field-1">Channel ID, handle or URL</FieldLabel>
                  <Input
                    id="channels-field-1"
                    required
                    value={input}
                    onChange={event => setInput(event.target.value)}
                    placeholder="UC…, @handle, channel or video URL"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="channels-field-2">Kind</FieldLabel>
                  <ToggleGroup
                    id="channels-field-2"
                    aria-label="Kind"
                    type="single"
                    variant="outline"
                    value={kind}
                    onValueChange={value => {
                      if (value) setKind(value);
                    }}
                  >
                    <ToggleGroupItem value="owned">Owned (workspace)</ToggleGroupItem>
                    <ToggleGroupItem value="competitor">Competitor (reference)</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="channels-field-3">Max videos</FieldLabel>
                  <Input
                    id="channels-field-3"
                    type="number"
                    min="50"
                    max="2000"
                    step="50"
                    required
                    value={maxVideos}
                    onChange={event => setMaxVideos(Number(event.target.value))}
                  />
                </Field>
                <Button disabled={action.isPending || !input.trim()}>
                  {action.isPending ? <Spinner data-icon="inline-start" /> : null}
                  {action.isPending ? 'Working…' : 'Add & sync'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {action.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{action.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.channels.isPending ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Loading channels…</span>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {rows('Owned channels', true)}
          {rows('Reference channels', false)}
        </>
      )}
    </>
  );
}
