import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RanksResponse, RankRemoveResponse, RankCheckResponse, RankKeyword } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, ChannelSelect, useOwnedChannel, Table } from './components/research';
import { LineChart } from './components/line-chart';
import { format } from './components/format';

function KeywordDetail({ keyword }: { keyword: RankKeyword }) {
  return (
    <details>
      <summary>History & top results</summary>
      <LineChart
        label={`${keyword.keyword} search position (lower is better)`}
        points={keyword.history.filter(p => p.position !== null).map(p => ({ day: p.day, value: p.position as number }))}
      />
      <p className="source-note">Lower position is better. Unranked days are omitted from the chart; see all readings below.</p>
      <ul>
        {keyword.history.map(p => (
          <li key={p.day}>
            {p.day}: {p.position === null ? 'Outside top 50' : format(p.position)}
          </li>
        ))}
      </ul>
      <h3>Top search results</h3>
      {keyword.top.length ? (
        <ol>
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
        <p>No search results recorded yet.</p>
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
        className="filters"
        onSubmit={e => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <label>
          Keyword to track
          <input value={keyword} onChange={e => setKeyword(e.target.value)} required minLength={2} />
        </label>
        <button type="submit" className="primary-button" disabled={add.isPending || keyword.trim().length < 2}>
          {add.isPending ? 'Tracking…' : 'Track'}
        </button>
      </form>
      <p className="source-note">
        Adding stores a local keyword and attempts one search check (100 quota units). Daily checks cost 100 units per keyword. Search calls have a separate
        100/day limit.
      </p>
      {add.isError ? <QueryError error={add.error} retry={() => add.mutate()} /> : null}
      {add.isSuccess ? <p role="status">Keyword saved. A history reading confirms that the initial search completed.</p> : null}
      <button type="button" className="secondary-button" disabled={check.isPending || add.isPending} onClick={() => check.mutate()}>
        {check.isPending ? 'Checking…' : 'Check now — all channels'}
      </button>
      <p className="source-note">Check now checks all tracked keywords across owned channels.</p>
      {check.isError ? <QueryError error={check.error} retry={() => check.mutate()} /> : null}
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
        <QueryError
          error={remove.error}
          retry={() => {
            if (confirm !== null) remove.mutate(confirm);
          }}
        />
      ) : null}
      <section className="dashboard-card">
        <h2>Tracked keywords</h2>
        {list.isPending ? (
          <p role="status">Loading keywords…</p>
        ) : list.isError ? (
          <QueryError error={list.error} retry={() => void list.refetch()} />
        ) : !list.data.keywords.length ? (
          <p>No keywords tracked for this channel yet.</p>
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
                      <small className="sample-note">{k.country}</small>
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
                          <button type="button" className="secondary-button" disabled={remove.isPending} onClick={() => remove.mutate(k.id)}>
                            Confirm remove
                          </button>
                          <button type="button" className="text-button" disabled={remove.isPending} onClick={() => setConfirm(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" className="text-button" onClick={() => setConfirm(k.id)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="source-note">{list.data.keywords[0].note} Positive 7-day change means an improvement.</p>
          </>
        )}
      </section>
    </>
  );
}
export function Ranks() {
  const channel = useOwnedChannel();
  return (
    <div>
      <PageHeader title="Rank tracker" description="Your position in YouTube search, checked every morning. Local tracking for the active owned channel." />
      {channel.channels.isPending ? (
        <p role="status">Loading owned channels…</p>
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
    </div>
  );
}
