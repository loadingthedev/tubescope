import { Inbox } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from '@/components/ui/empty';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type {
  AnalyticsOverview,
  AnalyticsVideo,
  AnalyticsTraffic,
  AnalyticsDemographics,
  AnalyticsGeo,
  AnalyticsDevices,
  AnalyticsContent,
  AnalyticsRetention,
  AnalyticsWatch,
  AnalyticsRevenue,
} from '@tubescope/shared';
import { getJson } from './api';
import { PageHeader, StatCard, StatGrid, Table, Tabs } from './components/research';
import { DataSection, OwnedPage } from './components/data-section';
import { LineChart } from './components/line-chart';
import { format, duration } from './components/format';

const metricLabel = (key: string) =>
  key === 'estimatedMinutesWatched' ? 'Watch minutes (est.)' : key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

function Rows({ title, rows, columns }: { title: string; rows: (string | number | null | undefined)[][]; columns: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex w-full flex-col gap-4">
        {!rows.length ? (
          <Empty className="w-full border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>No results</EmptyTitle>
              <EmptyDescription>No rows available for this period. YouTube may withhold small samples.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table caption={title}>
            <thead>
              <tr>
                {columns.map(c => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={JSON.stringify(row)}>
                  {row.map((v, j) => (
                    <td key={columns[j]}>{typeof v === 'number' ? format(v) : (v ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
function Overview({ id, days }: { id: string; days: number }) {
  const query = useQuery({
    queryKey: ['analytics', id, 'overview', days],
    queryFn: ({ signal }) => getJson<AnalyticsOverview>(`/analytics/${id}/overview?days=${days}`, signal),
  });
  return (
    <DataSection query={query}>
      {data => (
        <>
          <p>
            {data.source} · {data.period.startDate} → {data.period.endDate} · Reporting can lag about three days.
          </p>
          <StatGrid>
            {Object.entries(data.totals).map(([key, value]) => (
              <StatCard
                key={key}
                label={metricLabel(key)}
                value={key === 'averageViewDuration' ? duration(value) : format(value)}
                note={`Previous: ${format(data.previous[key])} · change: ${data.delta[key] == null ? '—' : `${format(data.delta[key] * 100)}%`}`}
              />
            ))}
          </StatGrid>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily views</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart label="Daily views" points={data.daily.map(d => ({ day: d.day, value: d.views }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Daily watch minutes (est.)</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart label="Watch minutes (est.)" points={data.daily.map(d => ({ day: d.day, value: d.estimatedMinutesWatched }))} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DataSection>
  );
}
function TopVideos({ id, days }: { id: string; days: number }) {
  const [split, setSplit] = useState('All');
  const [selected, select] = useState('');
  const query = useQuery({
    queryKey: ['analytics', id, 'top', days],
    queryFn: ({ signal }) => getJson<AnalyticsVideo[]>(`/analytics/${id}/top?days=${days}`, signal),
  });
  const retention = useQuery({
    queryKey: ['retention', id, selected],
    queryFn: ({ signal }) => getJson<AnalyticsRetention>(`/analytics/${id}/retention/${encodeURIComponent(selected)}`, signal),
    enabled: Boolean(selected),
  });
  return (
    <>
      <DataSection query={query}>
        {data => (
          <Card>
            <CardHeader>
              <CardTitle>Top videos & retention</CardTitle>
            </CardHeader>
            <CardContent className="flex w-full flex-col gap-4">
              <Tabs labels={['All', 'Long-form', 'Shorts']} value={split} onChange={setSplit} />
              <p>Format is available for synced videos. Unsynced formats remain in All.</p>
              {!data.some(v => split === 'All' || (v.is_short != null && (split === 'Shorts' ? Boolean(v.is_short) : !v.is_short))) ? (
                <Empty className="w-full border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox />
                    </EmptyMedia>
                    <EmptyTitle>No results</EmptyTitle>
                    <EmptyDescription>No videos in this period and format.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table caption="Top videos">
                  <thead>
                    <tr>
                      {['Video', 'Views', 'Watch minutes (est.)', 'Avg duration', 'Avg %', 'Subs gained', 'Retention'].map(c => (
                        <th scope="col" key={c}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data
                      .filter(v => split === 'All' || (v.is_short != null && (split === 'Shorts' ? Boolean(v.is_short) : !v.is_short)))
                      .map(v => (
                        <tr key={v.video}>
                          <th scope="row">
                            <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.video)}`} target="_blank" rel="noreferrer">
                              {v.title || v.video}
                            </a>
                          </th>
                          <td>{format(v.views)}</td>
                          <td>{format(v.estimatedMinutesWatched)}</td>
                          <td>{duration(v.averageViewDuration)}</td>
                          <td>{format(v.averageViewPercentage)}%</td>
                          <td>{format(v.subscribersGained)}</td>
                          <td>
                            <Button type="button" variant="outline" size="sm" onClick={() => select(v.video)}>
                              View retention
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </DataSection>
      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>Retention · {selected}</CardTitle>
          </CardHeader>
          <CardContent className="flex w-full flex-col gap-4">
            <DataSection query={retention}>
              {data => (
                <>
                  <LineChart
                    label="Audience watch ratio"
                    points={data.curve.map(p => ({ day: `${format(p.elapsedVideoTimeRatio * 100)}% elapsed`, value: p.audienceWatchRatio * 100 }))}
                  />
                  <Rows
                    title="Retention checkpoints"
                    columns={['Checkpoint', 'Audience remaining %']}
                    rows={Object.entries(data.checkpoints).map(([k, v]) => [k, v == null ? null : v * 100])}
                  />
                </>
              )}
            </DataSection>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
function Traffic({ id, days }: { id: string; days: number }) {
  const query = useQuery({
    queryKey: ['analytics', id, 'traffic', days],
    queryFn: ({ signal }) => getJson<AnalyticsTraffic>(`/analytics/${id}/traffic?days=${days}`, signal),
  });
  return (
    <DataSection query={query}>
      {data => (
        <>
          <Rows
            title="Traffic sources"
            columns={['Source', 'Views', 'Share %']}
            rows={data.types.map(r => [r.insightTrafficSourceType, r.views, r.share * 100])}
          />
          {(['searchTerms', 'suggestedFrom', 'externalSites'] as const).map(key => (
            <Rows
              key={key}
              title={{ searchTerms: 'Search terms', suggestedFrom: 'Suggested from', externalSites: 'External sites' }[key]}
              columns={['Source', 'Views']}
              rows={data[key].map(r => [r.insightTrafficSourceDetail, r.views])}
            />
          ))}
        </>
      )}
    </DataSection>
  );
}
function Audience({ id, days }: { id: string; days: number }) {
  const geo = useQuery({
    queryKey: ['analytics', id, 'geo', days],
    queryFn: ({ signal }) => getJson<AnalyticsGeo>(`/analytics/${id}/geo?days=${days}`, signal),
  });
  const demo = useQuery({
    queryKey: ['analytics', id, 'demographics', days],
    queryFn: ({ signal }) => getJson<AnalyticsDemographics>(`/analytics/${id}/demographics?days=${days}`, signal),
  });
  const devices = useQuery({
    queryKey: ['analytics', id, 'devices', days],
    queryFn: ({ signal }) => getJson<AnalyticsDevices>(`/analytics/${id}/devices?days=${days}`, signal),
  });
  return (
    <>
      <DataSection query={geo}>
        {d => (
          <Rows
            title="Countries"
            columns={['Country', 'Views', 'Share %', 'Avg duration (s)']}
            rows={d.rows.map(r => [r.country, r.views, r.share * 100, r.averageViewDuration])}
          />
        )}
      </DataSection>
      <DataSection query={demo}>
        {d => <Rows title="Demographics" columns={['Age', 'Gender', 'Viewer %']} rows={d.rows.map(r => [r.ageGroup, r.gender, r.viewerPercentage])} />}
      </DataSection>
      <DataSection query={devices}>{d => <Rows title="Devices" columns={['Device', 'Views']} rows={d.map(r => [r.deviceType, r.views])} />}</DataSection>
    </>
  );
}
function Content({ id, days }: { id: string; days: number }) {
  const query = useQuery({
    queryKey: ['analytics', id, 'content', days],
    queryFn: ({ signal }) => getJson<AnalyticsContent>(`/analytics/${id}/content-types?days=${days}`, signal),
  });
  return (
    <DataSection query={query}>
      {d => (
        <>
          <Rows title="Library mix · lifetime" columns={['Format', 'Videos', 'Views']} rows={d.library.map(r => [r.type, r.count, r.views])} />
          <Rows
            title="Content types · selected period"
            columns={['Format', 'Views', 'Watch minutes (est.)']}
            rows={d.analytics.map(r => [r.creatorContentType, r.views, r.estimatedMinutesWatched])}
          />
        </>
      )}
    </DataSection>
  );
}
function Monetization({ id, days }: { id: string; days: number }) {
  const watch = useQuery({ queryKey: ['analytics', id, 'watch'], queryFn: ({ signal }) => getJson<AnalyticsWatch>(`/analytics/${id}/watch-hours`, signal) });
  const revenue = useQuery({
    queryKey: ['analytics', id, 'revenue', days],
    queryFn: ({ signal }) => getJson<AnalyticsRevenue>(`/analytics/${id}/revenue?days=${days}`, signal),
  });
  return (
    <>
      <DataSection query={watch}>
        {d => (
          <Card>
            <CardHeader>
              <CardTitle>Watch hours & YPP</CardTitle>
            </CardHeader>
            <CardContent className="flex w-full flex-col gap-4">
              <p>
                {format(d.publicWatchHours)} watch hours (est.) / 4,000 · {format(d.subscribers)} subscribers / 1,000
              </p>
              <p>{d.note}</p>
              <LineChart label="Daily watch hours (est.)" points={d.daily.map(r => ({ day: r.day, value: r.estimatedMinutesWatched / 60 }))} />
            </CardContent>
          </Card>
        )}
      </DataSection>
      <DataSection query={revenue}>
        {d => (
          <Card>
            <CardHeader>
              <CardTitle>Revenue (est.)</CardTitle>
            </CardHeader>
            <CardContent className="flex w-full flex-col gap-4">
              {!d.available || !d.totals ? (
                <p>
                  Revenue unavailable: {d.reason}. <Link to="/calculators">Open calculators</Link>
                </p>
              ) : (
                <>
                  <p>
                    Revenue (est.): ${format(d.totals.revenue)} · RPM (est.): ${format(d.totals.rpm)}
                  </p>
                  <LineChart label="Daily revenue (est.)" points={d.daily.map(r => ({ day: r.day, value: r.estimatedRevenue }))} />
                </>
              )}
            </CardContent>
          </Card>
        )}
      </DataSection>
    </>
  );
}
function ConnectedAnalytics({ id }: { id: string }) {
  const [days, setDays] = useState(28);
  const [tab, setTab] = useState('Overview');
  return (
    <>
      <FieldGroup>
        <Field>
          <FieldLabel id="analytics-1-label" htmlFor="analytics-1">
            Period
          </FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            className="flex-wrap"
            id="analytics-1"
            aria-labelledby="analytics-1-label"
            value={String(days)}
            onValueChange={value => {
              if (value) {
                setDays(Number(value));
              }
            }}
          >
            {[7, 28, 90, 365].map(d => (
              <ToggleGroupItem key={d} value={String(d)}>
                Last {d} days
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </FieldGroup>
      <Button asChild variant="link" className="self-start px-0">
        <a href={`/api/export/audit/${id}?days=${days}&save=0`} target="_blank" rel="noreferrer">
          Open non-AI audit export (JSON)
        </a>
      </Button>
      <Tabs labels={['Overview', 'Traffic', 'Audience', 'Content types', 'Watch & revenue']} value={tab} onChange={setTab} />
      {tab === 'Overview' ? (
        <>
          <Overview id={id} days={days} />
          <TopVideos key={id} id={id} days={days} />
        </>
      ) : tab === 'Traffic' ? (
        <Traffic id={id} days={days} />
      ) : tab === 'Audience' ? (
        <Audience id={id} days={days} />
      ) : tab === 'Content types' ? (
        <Content id={id} days={days} />
      ) : (
        <Monetization id={id} days={days} />
      )}
    </>
  );
}
export function Analytics() {
  return (
    <>
      <PageHeader title="Analytics" description="Owner-authorized YouTube analytics. Read-only Google connection required." />
      <OwnedPage>
        {(id, authorized) =>
          authorized ? (
            <ConnectedAnalytics key={id} id={id} />
          ) : (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyTitle>Connect with Google</EmptyTitle>
                <EmptyDescription>Connect this owned channel with Google to read owner analytics. Tubescope uses read-only access.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/channels">Open Channels</Link>
                </Button>
              </EmptyContent>
            </Empty>
          )
        }
      </OwnedPage>
    </>
  );
}
