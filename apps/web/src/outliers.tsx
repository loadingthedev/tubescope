import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { SearchX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelsResponse, LocalOutlierVideo, OutlierSearchResponse, SettingsResponse } from '@tubescope/shared';
import { getJson } from './api';
import { ChannelSelect, PageHeader, QueryError, StatCard, StatGrid, Tabs, useOwnedChannel } from './components/research';
import { VideoTable } from './components/video-table';

function FilterChoice({ id, name, initial, options }: { id: string; name: string; initial: string; options: [string, string][] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Input type="hidden" name={name} value={value} />
      <ToggleGroup
        id={id}
        aria-labelledby={`${id}-label`}
        type="single"
        variant="outline"
        value={value}
        onValueChange={next => {
          if (next) setValue(next);
        }}
        className="flex-wrap"
      >
        {options.map(([key, label]) => (
          <ToggleGroupItem key={key} value={key}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}

function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

const tabs = ['Our channels + competitors', 'Search a topic'];
function FormatSelect({ name, initial }: { name: string; initial: string }) {
  return (
    <Field className="w-auto">
      <FieldLabel id="outliers-filter-1-label" htmlFor="outliers-filter-1">
        Format
      </FieldLabel>
      <FilterChoice
        id="outliers-filter-1"
        name={name}
        initial={initial}
        options={[
          ['long', 'Long-form'],
          ['shorts', 'Shorts'],
          ['all', 'All'],
        ]}
      />
    </Field>
  );
}
function Library({ ownedId }: { ownedId: string }) {
  const competitors = useQuery({
    queryKey: ['competitors', ownedId, 'list'],
    queryFn: ({ signal }) => getJson<ChannelsResponse>(`/competitors/${ownedId}`, signal),
  });
  const [params, setParams] = useState('');
  const result = useQuery({
    queryKey: ['outliers', 'local', ownedId, params],
    queryFn: ({ signal }) => getJson<LocalOutlierVideo[]>(`/outliers/local?${params}`, signal),
    enabled: Boolean(params),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const channels = data.get('channels') === 'all' ? [ownedId, ...(competitors.data || []).map(c => c.id)].join(',') : field(data, 'channels');
    const next = new URLSearchParams({
      channels,
      format: field(data, 'format'),
      minX: field(data, 'minX'),
      days: field(data, 'days'),
    }).toString();
    if (next === params) void result.refetch();
    else setParams(next);
  }
  return (
    <>
      <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
        <FieldGroup className="flex-row flex-wrap items-end gap-3">
          <FormatSelect name="format" initial="long" />
          <Field className="w-auto">
            <FieldLabel id="outliers-filter-2-label" htmlFor="outliers-filter-2">
              Minimum ×
            </FieldLabel>
            <Input id="outliers-filter-2" name="minX" type="number" min="0" step="0.5" defaultValue="2" required />
          </Field>
          <Field className="w-auto">
            <FieldLabel id="outliers-filter-3-label" htmlFor="outliers-filter-3">
              Within days
            </FieldLabel>
            <Input id="outliers-filter-3" name="days" type="number" min="1" defaultValue="365" required />
          </Field>
          <Field className="w-auto">
            <FieldLabel id="outliers-filter-4-label" htmlFor="outliers-filter-4">
              Channel
            </FieldLabel>
            <Select name="channels" defaultValue="all">
              <SelectTrigger id="outliers-filter-4" className="min-w-40 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All selected channels</SelectItem>
                  <SelectItem value={ownedId}>Our channel</SelectItem>
                  {competitors.data?.map(channel => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" disabled={competitors.isPending || competitors.isError || result.isFetching}>
            {competitors.isPending ? <Spinner data-icon="inline-start" /> : null}
            Find outliers
          </Button>
          <p className="text-sm text-muted-foreground">Synced library · No API quota used</p>
        </FieldGroup>
      </form>
      {competitors.isError ? <QueryError error={competitors.error} retry={() => void competitors.refetch()} /> : null}
      {result.isFetching ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Finding library outliers…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {result.isError ? <QueryError error={result.error} retry={() => void result.refetch()} /> : null}
      {result.data ? (
        <>
          <VideoTable rows={result.data} />
          <Alert>
            <AlertDescription>Outlier × = views ÷ median views of the same channel and format in the selected library window.</AlertDescription>
          </Alert>
        </>
      ) : !params ? (
        <p className="text-sm text-muted-foreground">Choose filters, then find outliers.</p>
      ) : null}
    </>
  );
}
function TopicSearch() {
  const [params, setParams] = useState('');
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => getJson<SettingsResponse>('/settings', signal) });
  const result = useQuery({
    queryKey: ['outliers', 'search', params],
    queryFn: async ({ signal }) => {
      try {
        return await getJson<OutlierSearchResponse>(`/outliers/search?${params}`, signal);
      } finally {
        void client.invalidateQueries({ queryKey: ['quota'] });
      }
    },
    enabled: Boolean(params),
    staleTime: 86_400_000,
    retry: false,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams({
      q: field(data, 'q').trim(),
      days: field(data, 'days'),
      format: field(data, 'format'),
      maxSubs: field(data, 'maxSubs'),
      order: field(data, 'order'),
      country: settings.data?.default_country || 'US',
      ...(data.get('baseline') ? { baseline: '1' } : {}),
    }).toString();
    if (next === params) void result.refetch();
    else setParams(next);
  }
  return (
    <>
      <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
        <FieldGroup className="flex-row flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel id="outliers-filter-5-label" htmlFor="outliers-filter-5">
              Topic
            </FieldLabel>
            <Input id="outliers-filter-5" name="q" type="search" placeholder="e.g. beginner photography" required maxLength={200} />
          </Field>
          <Field className="w-auto">
            <FieldLabel id="outliers-filter-6-label" htmlFor="outliers-filter-6">
              Period
            </FieldLabel>
            <FilterChoice
              id="outliers-filter-6"
              name="days"
              initial="90"
              options={[
                ['7', 'Last 7 days'],
                ['30', 'Last 30 days'],
                ['90', 'Last 90 days'],
                ['365', 'Last 365 days'],
              ]}
            />
          </Field>
          <FormatSelect name="format" initial="all" />
          <Field className="w-auto">
            <FieldLabel id="outliers-filter-7-label" htmlFor="outliers-filter-7">
              Max subs
            </FieldLabel>
            <Input id="outliers-filter-7" name="maxSubs" type="number" min="1" placeholder="Any" />
          </Field>
          <Field className="w-auto">
            <FieldLabel id="outliers-filter-8-label" htmlFor="outliers-filter-8">
              Sort
            </FieldLabel>
            <FilterChoice
              id="outliers-filter-8"
              name="order"
              initial="viewCount"
              options={[
                ['viewCount', 'Most viewed'],
                ['date', 'Newest'],
                ['relevance', 'Relevance'],
              ]}
            />
          </Field>
          <Field orientation="horizontal" className="w-auto">
            <Checkbox id="outliers-filter-9" name="baseline" />
            <FieldLabel id="outliers-filter-9-label" htmlFor="outliers-filter-9">
              Compare with each channel's normal
            </FieldLabel>
          </Field>
          <p className="text-sm text-muted-foreground">≈2 API units per channel, cached 24h</p>
          <Button type="submit" disabled={result.isFetching}>
            {result.isFetching ? <Spinner data-icon="inline-start" /> : null}
            Search
          </Button>
          <p className="text-sm text-muted-foreground">
            YouTube search costs 100+ API units. Initial results rank by views ÷ subscribers and views/day; use table headers to sort.
          </p>
        </FieldGroup>
      </form>
      {result.isFetching ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Searching YouTube and comparing channels…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {result.isError ? <QueryError error={result.error} retry={() => void result.refetch()} /> : null}
      {result.data ? (
        <>
          <StatGrid>
            <StatCard label="Search sample" value={result.data.sampleSize} note="Matching videos" />
          </StatGrid>
          {result.data.baselinePartial ? (
            <Alert role="status">
              <AlertDescription>Quota is low. Some channel baselines are unavailable.</AlertDescription>
            </Alert>
          ) : null}
          <VideoTable rows={result.data.results} />
          <Alert>
            <AlertDescription>{result.data.source}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Channel normal uses up to 30 recent uploads, separated by format, excluding the result itself. A ratio needs at least 5 comparable uploads and a
            nonzero median. Shorts classification uses duration and #shorts markers; the API does not expose aspect ratio.
          </p>
        </>
      ) : !params ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Search a topic</EmptyTitle>
            <EmptyDescription>Find videos that break out beyond their channel's usual audience.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </>
  );
}
export function Outliers() {
  const [tab, setTab] = useState(tabs[0]);
  const channel = useOwnedChannel();
  return (
    <>
      <PageHeader
        title="Outliers"
        description="Find videos performing above their channel's normal views. Library research uses synced data; topic search samples YouTube."
      />
      <ChannelSelect channel={channel} />
      <Tabs labels={tabs} value={tab} onChange={setTab} />
      {tab === tabs[1] ? (
        <TopicSearch />
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : channel.channels.isPending ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Loading channels…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : channel.current ? (
        <Library key={channel.current.id} ownedId={channel.current.id} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No results yet</EmptyTitle>
            <EmptyDescription>Add an owned channel in the classic UI to use library outliers.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
