import { useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ChannelSelect, QueryError, useOwnedChannel } from './research';

export function DataSection<T>({ query, children }: { query: UseQueryResult<T, Error>; children: (data: T) => ReactNode }) {
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  if (query.isPending) return <p role="status">Loading…</p>;
  return children(query.data);
}
export function OwnedPage({ children }: { children: (id: string, authorized: boolean) => ReactNode }) {
  const channel = useOwnedChannel();
  return (
    <DataSection query={channel.channels}>
      {() =>
        channel.current ? (
          <>
            <ChannelSelect channel={channel} />
            {children(channel.current.id, channel.current.authorized)}
          </>
        ) : (
          <p>
            No owned channels. <Link to="/channels">Add a channel</Link> to begin.
          </p>
        )
      }
    </DataSection>
  );
}
export function CopyText({ text, label = 'Copy text' }: { text: string; label?: string }) {
  const [status, setStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied.');
    } catch {
      setStatus('Copy failed. Select the text and copy manually.');
    }
  }
  return (
    <>
      <button type="button" onClick={() => void copy()}>
        {label}
      </button>
      <span role="status">{status}</span>
    </>
  );
}
export function ConfirmDelete({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <span>
      Delete locally?{' '}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          onConfirm();
          setConfirm(false);
        }}
      >
        Confirm {label}
      </button>{' '}
      <button type="button" onClick={() => setConfirm(false)}>
        Cancel
      </button>
    </span>
  ) : (
    <button type="button" disabled={disabled} onClick={() => setConfirm(true)}>
      {label}
    </button>
  );
}
