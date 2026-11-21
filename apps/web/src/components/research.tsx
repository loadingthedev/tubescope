import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import type { ChannelsResponse } from '@tubescope/shared';
import { getJson } from '../api';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs as UITabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>;
}

export function StatCard({ label, value, note, accent = false }: { label: string; value: ReactNode; note: string; accent?: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <p className="eyebrow">{label}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <strong className={cn('num text-2xl font-medium tracking-tight', accent && 'text-primary')}>{value}</strong>
        <CardDescription className="text-xs">{note}</CardDescription>
      </CardContent>
    </Card>
  );
}

export function Table({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="data-table">
      <table>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function QueryError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Couldn't load this</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      <AlertAction>
        <Button variant="outline" size="sm" onClick={retry}>
          <RotateCw data-icon="inline-start" />
          Try again
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function Tabs({ labels, value, onChange }: { labels: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <UITabs value={value} onValueChange={onChange}>
      <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
        {labels.map(label => (
          <TabsTrigger key={label} value={label}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </UITabs>
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
    <div className="flex items-center gap-2">
      <Label htmlFor="owned-channel" className="eyebrow">
        Channel
      </Label>
      <Select value={channel.current?.id || ''} onValueChange={channel.select}>
        <SelectTrigger id="owned-channel" className="min-w-52 bg-card">
          <SelectValue placeholder="Pick a channel" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {channel.owned.map(item => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
