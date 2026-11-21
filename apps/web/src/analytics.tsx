import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
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
import { PageHeader, StatCard, Table, Tabs } from './components/research';
import { DataSection, OwnedPage } from './components/data-section';
import { LineChart } from './components/line-chart';
import { format, duration } from './components/format';

function Rows({ title, rows, columns }: { title: string; rows: (string | number | null | undefined)[][]; columns: string[] }) {
  return (
    <section className="dashboard-card">
      <h2>{title}</h2>
      {!rows.length ? (
        <p>No rows available for this period. YouTube may withhold small samples.</p>
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
    </section>
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
          <div className="metrics">
            {Object.entries(data.totals).map(([key, value]) => (
              <StatCard
                key={key}
                label={key === 'estimatedMinutesWatched' ? 'Watch minutes (est.)' : key}
                value={key === 'averageViewDuration' ? duration(value) : format(value)}
                note={`Previous: ${format(data.previous[key])} · change: ${data.delta[key] == null ? '—' : `${format(data.delta[key] * 100)}%`}`}
              />
            ))}
          </div>
          <section className="dashboard-card">
            <h2>Daily views</h2>
            <LineChart label="Daily views" points={data.daily.map(d => ({ day: d.day, value: d.views }))} />
            <h2>Daily watch minutes (est.)</h2>
            <LineChart label="Watch minutes (est.)" points={data.daily.map(d => ({ day: d.day, value: d.estimatedMinutesWatched }))} />
          </section>
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
          <section className="dashboard-card">
            <h2>Top videos & retention</h2>
            <Tabs labels={['All', 'Long-form', 'Shorts']} value={split} onChange={setSplit} />
            <p>Format is available for synced videos. Unsynced formats remain in All.</p>
            {!data.some(v => split === 'All' || (v.is_short != null && (split === 'Shorts' ? Boolean(v.is_short) : !v.is_short))) ? (
              <p>No videos in this period and format.</p>
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
                          <button type="button" onClick={() => select(v.video)}>
                            View retention
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            )}
          </section>
        )}
      </DataSection>
      {selected ? (
        <section className="dashboard-card">
          <h2>Retention · {selected}</h2>
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
        </section>
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
          <section className="dashboard-card">
            <h2>Watch hours & YPP</h2>
            <p>
              {format(d.publicWatchHours)} watch hours (est.) / 4,000 · {format(d.subscribers)} subscribers / 1,000
            </p>
            <p>{d.note}</p>
            <LineChart label="Daily watch hours (est.)" points={d.daily.map(r => ({ day: r.day, value: r.estimatedMinutesWatched / 60 }))} />
          </section>
        )}
      </DataSection>
      <DataSection query={revenue}>
        {d => (
          <section className="dashboard-card">
            <h2>Revenue (est.)</h2>
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
          </section>
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
      <label>
        Period
        <select value={days} onChange={e => setDays(Number(e.target.value))}>
          {[7, 28, 90, 365].map(d => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </label>
      <p>
        <a href={`/api/export/audit/${id}?days=${days}&save=0`} target="_blank" rel="noreferrer">
          Open non-AI audit export (JSON)
        </a>
      </p>
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
    <div className="research-page">
      <PageHeader title="Analytics" description="Owner-authorized YouTube analytics. Read-only Google connection required." />
      <OwnedPage>
        {(id, authorized) =>
          authorized ? (
            <ConnectedAnalytics key={id} id={id} />
          ) : (
            <section className="empty-state">
              <h2>Connect with Google</h2>
              <p>Connect this owned channel with Google to read owner analytics. Tubescope uses read-only access.</p>
              <Link to="/channels">Open Channels</Link>
            </section>
          )
        }
      </OwnedPage>
    </div>
  );
}
