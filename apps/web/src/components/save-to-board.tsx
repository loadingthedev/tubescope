import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { Board, LocalChange } from '@tubescope/shared';
import { getJson, mutateJson } from '../api';
import { useOwnedChannel } from './research';
import { DataSection } from './data-section';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

export function SaveToBoard({ video }: { video: { id: string; title: string; thumbnail?: string | null } }) {
  const channel = useOwnedChannel();
  const id = channel.current?.id || '';
  const [open, setOpen] = useState(false);
  const [selected, select] = useState('');
  const client = useQueryClient();
  const boards = useQuery({ queryKey: ['boards', id], queryFn: ({ signal }) => getJson<Board[]>(`/boards/${id}`, signal), enabled: open && Boolean(id) });
  const save = useMutation({
    mutationFn: () => mutateJson<LocalChange>(`/boards/id/${selected}/items`, 'POST', { kind: 'video', ref: video }),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['boards'] }), client.invalidateQueries({ queryKey: ['board-items'] })]);
      toast.success('Saved to board');
      setOpen(false);
    },
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <BookmarkPlus data-icon="inline-start" />
          Save to board
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <DataSection query={channel.channels}>
          {() =>
            !id ? (
              <p className="text-sm text-muted-foreground">Add a channel of yours in Channels first.</p>
            ) : (
              <DataSection query={boards}>
                {data =>
                  !data.length ? (
                    <p className="text-sm text-muted-foreground">Create a board in Boards first.</p>
                  ) : (
                    <FieldGroup className="gap-3">
                      <Field>
                        <FieldLabel htmlFor={`board-${video.id}`}>Board for {channel.current?.title}</FieldLabel>
                        <Select
                          value={selected}
                          onValueChange={value => {
                            select(value);
                            save.reset();
                          }}
                        >
                          <SelectTrigger id={`board-${video.id}`} className="w-full">
                            <SelectValue placeholder="Choose a board" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {data.map(b => (
                                <SelectItem key={b.id} value={String(b.id)}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Button disabled={!data.some(b => String(b.id) === selected) || save.isPending} onClick={() => save.mutate()}>
                        {save.isPending ? <Spinner data-icon="inline-start" /> : null}
                        Save to board
                      </Button>
                      {save.isError ? (
                        <p role="alert" className="text-sm text-destructive">
                          {save.error.message}
                        </p>
                      ) : null}
                    </FieldGroup>
                  )
                }
              </DataSection>
            )
          }
        </DataSection>
      </PopoverContent>
    </Popover>
  );
}
