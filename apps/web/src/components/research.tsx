import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChannelsResponse } from '@tubescope/shared';
import { getJson } from '../api';

export function PageHeader({ title, description, section = title }: { title: string; description: string; section?: string }) {
  return (
    <div className="page-heading">
      <p className="eyebrow">Discovery / {section}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
export function StatCard({ label, value, note, accent = false }: { label: string; value: ReactNode; note: string; accent?: boolean }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={accent ? 'accent' : undefined}>{value}</strong>
      <p>{note}</p>
    </div>
  );
}
export function Table({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export function QueryError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert" className="error-message">
      <p>{error.message}</p>
      <button type="button" className="text-button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function Tabs({ labels, value, onChange }: { labels: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="tabs" role="group" aria-label="Sections">
      {labels.map(label => (
        <button key={label} type="button" aria-pressed={label === value} className={label === value ? 'active' : ''} onClick={() => onChange(label)}>
          {label}
        </button>
      ))}
    </div>
  );
}
export function useOwnedChannel() {
  const channels = useQuery({ queryKey: ['channels'], queryFn: ({ signal }) => getJson<ChannelsResponse>('/channels', signal) });
  const [selected, setSelected] = useState<string>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('td:current') || 'null');
      return typeof saved === 'string' ? saved : '';
    } catch {
      return '';
    }
  });
  const owned = channels.data?.filter(channel => channel.kind === 'owned') || [];
  const current = owned.find(channel => channel.id === selected) || owned[0];
  function select(id: string) {
    setSelected(id);
    localStorage.setItem('td:current', JSON.stringify(id));
  }
  return { channels, owned, current, select };
}
export function ChannelSelect({ channel }: { channel: ReturnType<typeof useOwnedChannel> }) {
  return (
    <label className="channel-select">
      Owned channel
      <select value={channel.current?.id || ''} onChange={event => channel.select(event.target.value)}>
        {channel.owned.map(item => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </label>
  );
}
