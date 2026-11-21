import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
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
        setNotice(`Added ${result.title}.`);
      } else if (path.endsWith('/sync')) {
        const result = await mutateJson<ChannelSyncResponse>(path, method, body);
        setNotice(`Synced ${format(result.synced)} videos; ${format(result.metadataChanges)} metadata changes.`);
      } else {
        await mutateJson(path, method, body);
        setNotice('Channel updated.');
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
      <section className="dashboard-card">
        <h2>
          {title} ({format(items.length)})
        </h2>
        {!items.length ? (
          <p className="muted">No {owned ? 'owned' : 'reference'} channels yet.</p>
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
                    <small className="sample-note">
                      {item.handle || item.id}
                      {item.oauth_email ? ` · ${item.oauth_email}` : ''}
                    </small>
                  </th>
                  <td>{format(item.subscriber_count)}</td>
                  <td>{format(item.view_count)}</td>
                  <td>{format(item.video_count)}</td>
                  <td>{timestamp(item.last_synced)}</td>
                  <td>{owned ? (item.authorized ? 'Google-connected' : 'Public only') : 'Competitor'}</td>
                  <td>
                    <div className="channel-actions">
                      {owned ? (
                        <button
                          type="button"
                          onClick={() => {
                            channel.select(item.id);
                            void navigate('/');
                          }}
                        >
                          Use{channel.current?.id === item.id ? ' (active)' : ''}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ path: `/channels/${item.id}/sync`, body: { force: true } })}
                      >
                        Sync
                      </button>
                      <button
                        type="button"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ path: `/channels/${item.id}/kind`, body: { kind: owned ? 'competitor' : 'owned' } })}
                      >
                        {owned ? '→ competitor' : 'Mark as owned'}
                      </button>
                      {item.authorized ? (
                        <button type="button" disabled={action.isPending} onClick={() => setConfirm(`disconnect:${item.id}`)}>
                          Disconnect
                        </button>
                      ) : null}
                      <button type="button" disabled={action.isPending} onClick={() => setConfirm(`remove:${item.id}`)}>
                        Remove
                      </button>
                    </div>
                    {confirm.endsWith(`:${item.id}`) ? (
                      <div role="group" aria-label="Confirm channel action">
                        <p>
                          {confirm.startsWith('remove:')
                            ? 'Remove this channel and all its local data? YouTube is unchanged.'
                            : 'Remove the stored Google tokens for this channel?'}
                        </p>
                        <button
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
                        </button>{' '}
                        <button type="button" disabled={action.isPending} onClick={() => setConfirm('')}>
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    );
  }
  return (
    <div className="channels-page">
      <PageHeader title="Channels" description="Manage owned workspaces and reference channels in the local database." />
      <div className="dashboard-grid">
        <section className="dashboard-card">
          <h2>Connect a channel you own</h2>
          <p>Google access is read-only: analytics only; no edits, replies or uploads. Tokens stay in this app’s local database.</p>
          <button type="button" className="primary-button" disabled={action.isPending} onClick={() => action.mutate({ path: '/oauth/url' })}>
            Connect with Google
          </button>
          <p className="muted">Set the Google OAuth client ID and secret in Settings first. Repeat the connection for each owned channel.</p>
        </section>
        <section className="dashboard-card">
          <h2>Add by ID, handle or URL</h2>
          <form onSubmit={submit} className="settings-fields">
            <label>
              Channel ID, handle or URL
              <input required value={input} onChange={event => setInput(event.target.value)} placeholder="UC…, @handle, channel or video URL" />
            </label>
            <label>
              Kind
              <select value={kind} onChange={event => setKind(event.target.value)}>
                <option value="owned">Owned (workspace)</option>
                <option value="competitor">Competitor (reference)</option>
              </select>
            </label>
            <label>
              Max videos
              <input type="number" min="50" max="2000" step="50" required value={maxVideos} onChange={event => setMaxVideos(Number(event.target.value))} />
            </label>
            <button className="primary-button" disabled={action.isPending || !input.trim()}>
              {action.isPending ? 'Working…' : 'Add & sync'}
            </button>
          </form>
        </section>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {action.isError ? (
        <p role="alert" className="error-message">
          {action.error.message}
        </p>
      ) : null}
      {channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.channels.isPending ? (
        <p role="status">Loading channels…</p>
      ) : (
        <>
          {rows('Owned channels', true)}
          {rows('Reference channels', false)}
        </>
      )}
    </div>
  );
}
