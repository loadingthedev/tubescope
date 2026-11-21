import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Board, LocalChange } from '@tubescope/shared';
import { getJson, mutateJson } from '../api';
import { useOwnedChannel } from './research';
import { DataSection } from './data-section';
export function SaveToBoard({ video }: { video: { id: string; title: string; thumbnail?: string | null } }) {
  const channel = useOwnedChannel();
  const id = channel.current?.id || '';
  const [open, setOpen] = useState(false);
  const [selected, select] = useState('');
  const client = useQueryClient();
  const boards = useQuery({ queryKey: ['boards', id], queryFn: ({ signal }) => getJson<Board[]>(`/boards/${id}`, signal), enabled: open && Boolean(id) });
  const save = useMutation({
    mutationFn: () => mutateJson<LocalChange>(`/boards/id/${selected}/items`, 'POST', { kind: 'video', ref: video }),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ['boards'] }), client.invalidateQueries({ queryKey: ['board-items'] })]),
  });
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Save to board
      </button>
      {open ? (
        <DataSection query={channel.channels}>
          {() =>
            !id ? (
              <p>Add an owned channel in Channels first.</p>
            ) : (
              <DataSection query={boards}>
                {data =>
                  !data.length ? (
                    <p>Create a board in Boards first.</p>
                  ) : (
                    <>
                      <label>
                        Board for {channel.current?.title}
                        <select
                          value={selected}
                          onChange={e => {
                            select(e.target.value);
                            save.reset();
                          }}
                        >
                          <option value="">Choose a board</option>
                          {data.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" disabled={!data.some(b => String(b.id) === selected) || save.isPending} onClick={() => save.mutate()}>
                        Save video locally
                      </button>
                      {save.isError ? <p role="alert">{save.error.message}</p> : save.isSuccess ? <p role="status">Saved to board.</p> : null}
                    </>
                  )
                }
              </DataSection>
            )
          }
        </DataSection>
      ) : null}
    </div>
  );
}
