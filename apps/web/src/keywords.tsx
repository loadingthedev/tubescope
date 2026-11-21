import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ChevronRight, Search, Users } from 'lucide-react';
import type { KeywordCompetitionResponse, KeywordDemandResponse, KeywordExploreResponse, RelatedTag, SettingsResponse } from '@tubescope/shared';
import { getJson } from './api';
import { format } from './components/format';
import { PageHeader, QueryError, StatCard, StatGrid, Table } from './components/research';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Suggestions({ title, items, onExplore }: { title: string; items: string[]; onExplore: (keyword: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <span className="num text-xs text-muted-foreground">{items.length}</span>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="-mx-2 flex flex-col">
            {items.map(item => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => onExplore(item)}
                  className="group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  {item}
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No suggestions returned. Try another seed.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RelatedTags({ tags, sampleSize, onExplore }: { tags: RelatedTag[]; sampleSize: number; onExplore: (keyword: string) => void }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Related keywords from tags">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">Keywords the top videos use</h3>
        <span className="num text-xs text-muted-foreground">{tags.length}</span>
      </div>
      {tags.length ? (
        <Table caption={`Tags shared by at least two channels in the top ${sampleSize} results`}>
          <thead>
            <tr>
              <th scope="col">Keyword</th>
              <th scope="col">Channels</th>
              <th scope="col">Videos</th>
              <th scope="col">Their views</th>
            </tr>
          </thead>
          <tbody>
            {tags.map(t => (
              <tr key={t.tag}>
                <td>
                  <Button variant="link" className="h-auto p-0" onClick={() => onExplore(t.tag)}>
                    {t.tag}
                  </Button>
                </td>
                <td>{t.channels}</td>
                <td>{t.videos}</td>
                <td>{format(t.views)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">No tag is shared by two or more ranking channels for this seed.</p>
      )}
    </section>
  );
}

function Competition({ data, onExplore }: { data: KeywordCompetitionResponse; onExplore: (keyword: string) => void }) {
  return (
    <section className="flex flex-col gap-4" aria-label="Competition evidence">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">Search sample · {data.country}</p>
          <h2 className="text-xl font-semibold">Competition evidence</h2>
        </div>
        <span className="num text-xs text-muted-foreground">{data.sampleSize} results</span>
      </div>
      <StatGrid>
        <StatCard
          label="Opportunity score"
          accent
          value={
            <>
              {data.opportunityScore}
              <small className="text-sm text-muted-foreground">/100</small>
            </>
          }
          note="Higher means more room"
        />
        <StatCard label="Median views" value={format(data.medianViews)} note="Top results" />
        <StatCard label="Median channel size" value={format(data.medianChannelSubs)} note="Subscribers" />
        <StatCard label="Results under 90 days" value={percent(data.recentShare)} note="Fresh content ranking" />
      </StatGrid>
      <p className="text-sm text-muted-foreground">
        Small channels: <span className="num">{percent(data.smallChannelShare)}</span> · Exact title matches:{' '}
        <span className="num">{percent(data.exactTitleShare)}</span>
      </p>
      {data.results.length ? (
        <Table caption="Top search results, sorted by views">
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
                <td className="max-w-[26rem] min-w-64">
                  <a
                    className="line-clamp-2 font-medium"
                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {video.title}
                  </a>
                </td>
                <td className="text-muted-foreground">{video.channel_title}</td>
                <td>{format(video.view_count)}</td>
                <td>{format(video.channel_subs)}</td>
                <td>{video.age_days}</td>
                <td>{format(Math.round(video.vpd))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">No results returned for this seed.</p>
      )}
      <RelatedTags tags={data.relatedTags} sampleSize={data.sampleSize} onExplore={onExplore} />
      <details className="group rounded-lg border bg-card px-4 py-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" className="size-4 transition-transform group-open:rotate-90" />
          Scoring method and source
        </summary>
        <div className="mt-2 flex flex-col gap-2 pl-5.5 text-muted-foreground">
          <p>{data.formula}</p>
          <p>{data.source}</p>
        </div>
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
  if (!demand.data)
    return (
      <Card role="status">
        <CardContent className="flex items-center gap-5">
          <span className="sr-only">Loading demand signals…</span>
          <Skeleton className="h-12 w-20" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <p className="num shrink-0 text-5xl leading-none font-medium text-primary">
          {demand.data.demandIndex}
          <small className="text-base text-muted-foreground">/100</small>
        </p>
        <div className="flex flex-col gap-1">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            Demand index
            <Badge variant="secondary">{demand.data.band}</Badge>
          </h3>
          <p className="text-sm text-muted-foreground">{demand.data.note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ExploreResult({ explore, onExplore }: Pick<Research, 'explore'> & { onExplore: (keyword: string) => void }) {
  if (explore.isError) return <QueryError error={explore.error} retry={() => void explore.refetch()} />;
  if (!explore.data)
    return (
      <div role="status" className="grid gap-4 md:grid-cols-2">
        <span className="sr-only">Reading autocomplete suggestions…</span>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Suggestions title="Autocomplete" items={explore.data.autocomplete} onExplore={onExplore} />
        <Suggestions title="Long-tail ideas" items={explore.data.longTail.map(item => item.keyword)} onExplore={onExplore} />
      </div>
      <p className="text-xs text-muted-foreground">{explore.data.source}</p>
    </div>
  );
}

function KeywordResults({
  search,
  research,
  showCompetition,
  requestEvidence,
  onExplore,
}: {
  search: Search;
  research: Research;
  showCompetition: boolean;
  requestEvidence: () => void;
  onExplore: (keyword: string) => void;
}) {
  const { explore, demand, competition } = research;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">Results for “{search.seed}”</h2>
        <Badge variant="outline" className="num">
          {search.country}
        </Badge>
      </div>
      <section aria-label="Demand index" aria-live="polite">
        <DemandResult demand={demand} />
      </section>
      <ExploreResult explore={explore} onExplore={onExplore} />
      <Card>
        <CardHeader>
          <CardTitle>Who already ranks?</CardTitle>
          <CardDescription>Competition evidence uses a real search sample. About 102 API units per keyword, cached for 24 hours.</CardDescription>
          <CardAction>
            <Button variant="outline" disabled={competition.isFetching} onClick={requestEvidence}>
              {competition.isFetching ? <Spinner data-icon="inline-start" /> : <Users data-icon="inline-start" />}
              {competition.isFetching ? 'Checking…' : 'Check competition'}
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
      {showCompetition && competition.isError ? <QueryError error={competition.error} retry={() => void competition.refetch()} /> : null}
      {showCompetition && competition.data ? <Competition data={competition.data} onExplore={onExplore} /> : null}
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
  function exploreKeyword(keyword: string) {
    setSeed(keyword);
    setShowCompetition(false);
    setSearch({ seed: keyword, country: settings.data?.default_country || 'US' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <PageHeader title="Keyword research" description="Find search ideas. Check the evidence before choosing a topic." />
      <form onSubmit={submit} className="max-w-2xl">
        <Field>
          <FieldLabel htmlFor="seed" className="sr-only">
            Seed keyword
          </FieldLabel>
          <InputGroup className="h-11 bg-card shadow-paper">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              id="seed"
              name="seed"
              type="search"
              value={seed}
              onChange={event => setSeed(event.target.value)}
              placeholder="A seed keyword, e.g. history of everyday things"
              required
              maxLength={200}
              className="text-base"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" variant="default" size="sm" disabled={!seed.trim() || research.explore.isFetching}>
                {research.explore.isFetching ? <Spinner data-icon="inline-start" /> : null}
                {research.explore.isFetching ? 'Exploring…' : 'Explore'}
                {research.explore.isFetching ? null : <ArrowUpRight data-icon="inline-end" />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription className="text-xs">YouTube autocomplete · No API quota used for exploring</FieldDescription>
        </Field>
      </form>
      {!search.seed ? (
        <Empty className="border border-dashed bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Start with a seed</EmptyTitle>
            <EmptyDescription>A topic, a question, or a phrase your audience searches for.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <KeywordResults
          search={search}
          research={research}
          showCompetition={showCompetition}
          requestEvidence={() => {
            setShowCompetition(true);
            if (showCompetition && research.competition.isError) void research.competition.refetch();
          }}
          onExplore={exploreKeyword}
        />
      )}
    </>
  );
}
