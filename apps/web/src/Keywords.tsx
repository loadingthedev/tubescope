import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { KeywordCompetitionResponse, KeywordDemandResponse, KeywordExploreResponse, SettingsResponse } from '@tubescope/shared';
import { getJson } from './api';

const format = (value: number | null) => (value === null ? '—' : value.toLocaleString());
const percent = (value: number) => `${Math.round(value * 100)}%`;

function QueryError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert" className="error-message">
      <p>{error.message}</p>
      <button type="button" className="text-button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

function Suggestions({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="suggestions">
      <div className="section-heading">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      {items.length ? (
        <ul>
          {items.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No suggestions returned. Try another seed.</p>
      )}
    </section>
  );
}

function Competition({ data }: { data: KeywordCompetitionResponse }) {
  return (
    <section className="competition" aria-label="Competition evidence">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Search sample · {data.country}</p>
          <h2>Competition evidence</h2>
        </div>
        <span>{data.sampleSize} results</span>
      </div>
      <div className="metrics">
        <div>
          <span>Opportunity score</span>
          <strong className="accent">
            {data.opportunityScore}
            <small>/100</small>
          </strong>
          <p>Higher = more room</p>
        </div>
        <div>
          <span>Median views</span>
          <strong>{format(data.medianViews)}</strong>
          <p>Top results</p>
        </div>
        <div>
          <span>Median channel size</span>
          <strong>{format(data.medianChannelSubs)}</strong>
          <p>Subscribers</p>
        </div>
        <div>
          <span>Results under 90 days</span>
          <strong>{percent(data.recentShare)}</strong>
          <p>Fresh content ranking</p>
        </div>
      </div>
      <p className="muted evidence-detail">
        Small channels: {percent(data.smallChannelShare)} · Exact title matches: {percent(data.exactTitleShare)}
      </p>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Top search results, sorted by views</caption>
          <thead>
            <tr>
              <th scope="col">Video</th>
              <th scope="col">Channel</th>
              <th scope="col">Views</th>
              <th scope="col">Subscribers</th>
              <th scope="col">Age (days)</th>
              <th scope="col">Views/day</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map(video => (
              <tr key={video.id}>
                <td>
                  <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noreferrer">
                    {video.title}
                  </a>
                </td>
                <td>{video.channel_title}</td>
                <td>{format(video.view_count)}</td>
                <td>{format(video.channel_subs)}</td>
                <td>{video.age_days}</td>
                <td>{format(Math.round(video.vpd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.results.length ? <p className="muted">No results returned for this seed.</p> : null}
      <details className="method">
        <summary>Scoring method & source</summary>
        <p>{data.formula}</p>
        <p>{data.source}</p>
      </details>
    </section>
  );
}

type Search = { seed: string; country: string };

function useKeywordResearch(search: Search, showCompetition: boolean) {
  const client = useQueryClient();
  const params = new URLSearchParams({ q: search.seed, country: search.country }).toString();
  const explore = useQuery({
    queryKey: ['keywords', 'explore', search],
    queryFn: ({ signal }) => getJson<KeywordExploreResponse>(`/keywords/explore?${params}`, signal),
    enabled: Boolean(search.seed),
    staleTime: 86_400_000,
  });
  const demand = useQuery({
    queryKey: ['keywords', 'demand', search],
    queryFn: ({ signal }) => getJson<KeywordDemandResponse>(`/keywords/demand?${params}`, signal),
    enabled: Boolean(search.seed),
    staleTime: 86_400_000,
  });
  const competition = useQuery({
    queryKey: ['keywords', 'competition', search],
    queryFn: async ({ signal }) => {
      const data = await getJson<KeywordCompetitionResponse>(`/keywords/competition?${params}`, signal);
      void client.invalidateQueries({ queryKey: ['quota'] });
      return data;
    },
    enabled: Boolean(search.seed) && showCompetition,
    staleTime: 86_400_000,
  });

  return { explore, demand, competition };
}

type Research = ReturnType<typeof useKeywordResearch>;

function DemandResult({ demand }: Pick<Research, 'demand'>) {
  if (demand.isError) return <QueryError error={demand.error} retry={() => void demand.refetch()} />;
  if (!demand.data) return <p className="muted">Loading demand signals…</p>;
  return (
    <>
      <div className="demand-score">
        {demand.data.demandIndex}
        <small>/100</small>
      </div>
      <div>
        <h2>
          Demand index <span className="muted">· {demand.data.band}</span>
        </h2>
        <p>{demand.data.note}</p>
      </div>
    </>
  );
}

function ExploreResult({ explore }: Pick<Research, 'explore'>) {
  if (explore.isError) return <QueryError error={explore.error} retry={() => void explore.refetch()} />;
  if (!explore.data)
    return (
      <p role="status" className="muted">
        Reading autocomplete suggestions…
      </p>
    );
  return (
    <>
      <div className="suggestion-columns">
        <Suggestions title="Autocomplete" items={explore.data.autocomplete} />
        <Suggestions title="Long-tail ideas" items={explore.data.longTail.map(item => item.keyword)} />
      </div>
      <p className="source-note">{explore.data.source}</p>
    </>
  );
}

function KeywordResults({
  search,
  research,
  showCompetition,
  requestEvidence,
}: {
  search: Search;
  research: Research;
  showCompetition: boolean;
  requestEvidence: () => void;
}) {
  const { explore, demand, competition } = research;
  return (
    <>
      <div className="results-heading">
        <h2>Results for “{search.seed}”</h2>
        <span>{search.country}</span>
      </div>
      <section className="demand" aria-label="Demand index" aria-live="polite">
        <DemandResult demand={demand} />
      </section>
      <ExploreResult explore={explore} />
      <div className="evidence-action">
        <div>
          <h2>Who already ranks?</h2>
          <p>Competition evidence uses a real search sample. ≈102 API units per keyword, cached for 24 hours.</p>
        </div>
        <button type="button" className="secondary-button" disabled={competition.isFetching} onClick={requestEvidence}>
          {competition.isFetching ? 'Checking…' : 'Competition evidence'}
        </button>
      </div>
      {showCompetition && competition.isError ? <QueryError error={competition.error} retry={() => void competition.refetch()} /> : null}
      {showCompetition && competition.data ? <Competition data={competition.data} /> : null}
    </>
  );
}

export function Keywords() {
  const [seed, setSeed] = useState('');
  const [search, setSearch] = useState<Search>({ seed: '', country: 'US' });
  const [showCompetition, setShowCompetition] = useState(false);
  const settings = useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => getJson<SettingsResponse>('/settings', signal) });
  const research = useKeywordResearch(search, showCompetition);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seed.trim()) return;
    const country = settings.data?.default_country || 'US';
    setShowCompetition(false);
    if (search.seed === seed.trim() && search.country === country) {
      void research.explore.refetch();
      void research.demand.refetch();
    } else setSearch({ seed: seed.trim(), country });
  }

  return (
    <div className="keywords-page">
      <div className="page-heading">
        <p className="eyebrow">Discovery / Keywords</p>
        <h1>Keyword research</h1>
        <p>Find search ideas. Check the evidence before choosing a topic.</p>
      </div>
      <form className="search-form" onSubmit={submit}>
        <label htmlFor="seed">Seed keyword</label>
        <div className="search-row">
          <input
            id="seed"
            name="seed"
            type="search"
            value={seed}
            onChange={event => setSeed(event.target.value)}
            placeholder="e.g. medicaid for parents"
            required
            maxLength={200}
          />
          <button type="submit" className="primary-button" disabled={!seed.trim() || research.explore.isFetching}>
            {' '}
            {research.explore.isFetching ? 'Exploring…' : 'Explore'} <span aria-hidden="true">↗</span>
          </button>
        </div>
        <p className="search-hint">YouTube autocomplete · No API quota used for exploration</p>
      </form>
      {!search.seed ? (
        <div className="empty-state">
          <span aria-hidden="true">⌕</span>
          <h2>Start with a seed</h2>
          <p>A topic, a question, or a phrase your audience searches for.</p>
        </div>
      ) : (
        <KeywordResults
          search={search}
          research={research}
          showCompetition={showCompetition}
          requestEvidence={() => {
            setShowCompetition(true);
            if (showCompetition && research.competition.isError) void research.competition.refetch();
          }}
        />
      )}
    </div>
  );
}
