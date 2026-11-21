import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Copy, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { ChannelSelect, QueryError, useOwnedChannel } from './research';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

export function DataSection<T>({ query, children }: { query: UseQueryResult<T, Error>; children: (data: T) => ReactNode }) {
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  if (query.isPending)
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
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
          <Empty className="border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Tv />
              </EmptyMedia>
              <EmptyTitle>No channel of yours yet</EmptyTitle>
              <EmptyDescription>Add the channel you run to see its videos, analytics and comments here.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/channels">Add a channel</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )
      }
    </DataSection>
  );
}

export function CopyText({ text, label = 'Copy text' }: { text: string; label?: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed. Select the text and copy it manually.');
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={() => void copy()}>
      <Copy data-icon="inline-start" />
      {label}
    </Button>
  );
}

export function ConfirmDelete({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} className="text-destructive hover:text-destructive">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>This removes it from Tubescope on this computer. Nothing on YouTube changes.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
