import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RadarWatchResponse, RadarWatchVideo, RadarCurveResponse, RadarModelResponse, RadarJobResponse, RadarAlertsResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, ChannelSelect, useOwnedChannel, Table, Tabs, StatCard } from './components/research';
import { LineChart } from './components/line-chart';
import { format, times, timestamp } from './components/format';

function LaunchCurve({ videoId }: { videoId: string }) {
  const curve = useQuery({
    queryKey: ['radar', 'curve', videoId],
    queryFn: ({ signal }) => getJson<RadarCurveResponse>(`/radar/curve/${encodeURIComponent(videoId)}`, signal),
  });
  if (curve.isPending) return <p role="status">Loading launch curve…</p>;
  if (curve.isError) return <QueryError error={curve.error} retry={() => void curve.refetch()} />;
  return (
    <section className="dashboard-card">
      <h2>{curve.data.video.title} · launch curve</h2>
      <p className="source-note">
        Baseline: {curve.data.video.baseline_source || 'Unavailable'} · {curve.data.video.confidence || 'unknown'} confidence. Usual curve is an est. when
        confidence is low.
      </p>
      <h3>Observed views</h3>
      <LineChart
        label="Observed launch views"
        points={curve.data.ticks.filter(t => t.views !== null).map(t => ({ day: `${format(t.age_hours)}h`, value: t.views as number }))}
      />
      <h3>Usual views at the same age</h3>
      <LineChart
        label="Usual launch views"
        points={curve.data.expected.filter(p => p.v !== null).map(p => ({ day: `${format(p.h)}h`, value: p.v as number }))}
      />
      <Table caption="Usual views by age">
        <thead>
          <tr>
            <th scope="col">Age (hours)</th>
            <th scope="col">Usual views (est. if low confidence)</th>
          </tr>
        </thead>
        <tbody>
          {curve.data.expected.map(p => (
            <tr key={`${p.h}:${p.v}`}>
              <td>{format(p.h)}</td>
              <td>{format(p.v)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}
function WatchTable({ title, videos, onCurve }: { title: string; videos: RadarWatchVideo[]; onCurve: (id: string) => void }) {
  return (
    <section className="dashboard-card">
      <h2>{title}</h2>
      {!videos.length ? (
        <p>No recent uploads on the radar. Synced uploads appear after the watch job runs.</p>
      ) : (
        <Table caption={title}>
          <thead>
            <tr>
              {['Video', 'Age (hours)', 'Views', 'Usual at this age', 'Pace', 'Status', 'Peak', 'CTR', 'Retention', 'Curve'].map(c => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {videos.map(v => (
              <tr key={v.video_id}>
                <td>
                  <a className="video-cell" href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.video_id)}`} target="_blank" rel="noreferrer">
                    {v.thumbnail ? <img src={v.thumbnail} alt="" width="96" height="54" loading="lazy" /> : null}
                    {v.title || v.video_id}
                  </a>
                  <small className="sample-note">
                    {v.channel_title} · {v.active ? 'Watching' : 'Final reading'}
                  </small>
                </td>
                <td>{format(v.age_hours)}</td>
                <td>{format(v.views)}</td>
                <td title={v.baseline_source || ''}>
                  {format(v.expected)}
                  {v.confidence === 'low' ? ' est.' : ''}
                </td>
                <td>{times(v.idx)}</td>
                <td>{v.status || '—'}</td>
                <td>{times(v.peak_idx)}</td>
                <td>
                  {v.ctr === null ? '—' : `${format(v.ctr)}%`}
                  <small className="sample-note">{times(v.ctr_vs_channel)} usual</small>
                </td>
                <td>
                  {v.retention_pct === null ? '—' : `${format(v.retention_pct)}%`}
                  <small className="sample-note">{times(v.retention_vs_channel)} usual</small>
                </td>
                <td>
                  <button type="button" className="text-button" onClick={() => onCurve(v.video_id)}>
                    View curve
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
function LiveWatch({ channelId }: { channelId: string }) {
  const [videoId, setVideoId] = useState('');
  const board = useQuery({
    queryKey: ['radar', 'watch', channelId],
    queryFn: ({ signal }) => getJson<RadarWatchResponse>(`/radar/watch/${encodeURIComponent(channelId)}`, signal),
    refetchInterval: 60_000,
  });
  const alerts = useQuery({
    queryKey: ['radar', 'alerts', channelId],
    queryFn: ({ signal }) => getJson<RadarAlertsResponse>(`/alerts/${encodeURIComponent(channelId)}`, signal),
    refetchInterval: 60_000,
  });
  const breakouts = alerts.data?.filter(a => ['radar_breakout', 'radar_competitor_breakout'].includes(a.kind)) || [];
  return (
    <>
      <p className="source-note">The scheduled watch runs hourly (about 2 quota units per channel). This page refreshes stored readings each minute.</p>
      <button
        type="button"
        className="secondary-button"
        disabled={board.isFetching || alerts.isFetching}
        onClick={() => {
          void board.refetch();
          void alerts.refetch();
        }}
      >
        Refresh stored readings
      </button>
      <p className="source-note">Manual watch execution is unavailable here: the existing endpoint also runs autopilot and notification actions.</p>
      {board.isPending ? (
        <p role="status">Loading watch list…</p>
      ) : board.isError ? (
        <QueryError error={board.error} retry={() => void board.refetch()} />
      ) : (
        <>
          <p>
            Last check: {timestamp(board.data.lastRun?.at || null)} · {format(board.data.lastRun?.watched)} videos · {format(board.data.lastRun?.channels)}{' '}
            channels
          </p>
          {board.data.lastRun?.errors.length ? (
            <ul role="alert">
              {board.data.lastRun.errors.map((e, i) => (
                <li key={`${i}:${e}`}>{e}</li>
              ))}
            </ul>
          ) : null}
          <WatchTable title="Your uploads" videos={board.data.videos.filter(v => v.kind === 'owned')} onCurve={setVideoId} />
          <WatchTable title="Competitor uploads" videos={board.data.videos.filter(v => v.kind === 'competitor')} onCurve={setVideoId} />
        </>
      )}
      <section className="dashboard-card">
        <h2>Breakout alerts</h2>
        {alerts.isPending ? (
          <p role="status">Loading breakout alerts…</p>
        ) : alerts.isError ? (
          <QueryError error={alerts.error} retry={() => void alerts.refetch()} />
        ) : !breakouts.length ? (
          <p>No breakout alerts yet.</p>
        ) : (
          <ul>
            {breakouts.map(a => (
              <li key={a.id}>
                {a.kind === 'radar_breakout' ? 'Your upload' : 'Competitor upload'} · {times(a.payload.x)} usual pace after {format(a.payload.ageHours)}h ·{' '}
                {timestamp(a.created_at)}{' '}
                {a.payload.videoId ? (
                  <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(a.payload.videoId)}`} target="_blank" rel="noreferrer">
                    Open video
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="source-note">
        Pace = views now ÷ usual views at this age. Low-confidence estimates require a higher breakout threshold. CTR reports can arrive about two days late.
        Retention comes from measured channel analytics.
      </p>
      {videoId ? (
        <>
          <button type="button" className="text-button" onClick={() => setVideoId('')}>
            Close curve
          </button>
          <LaunchCurve key={videoId} videoId={videoId} />
        </>
      ) : null}
    </>
  );
}
const dataAxes = [
  ['patternFit', 'Pattern fit'],
  ['freshness', 'Freshness'],
  ['titleCraft', 'Title craft'],
] as const;
function Calibration({ channelId }: { channelId: string }) {
  const client = useQueryClient();
  const [minAgeDays, setMinAgeDays] = useState(14);
  const [jobId, setJobId] = useState('');
  const model = useQuery({
    queryKey: ['radar', 'model', channelId],
    queryFn: ({ signal }) => getJson<RadarModelResponse>(`/radar/model/${encodeURIComponent(channelId)}`, signal),
  });
  const start = useMutation({
    mutationFn: () => mutateJson<RadarJobResponse>(`/radar/calibrate/${encodeURIComponent(channelId)}`, 'POST', { ai: false, aiLimit: 0, minAgeDays }),
    onSuccess: data => {
      setJobId(data.id);
      void client.invalidateQueries({ queryKey: ['radar', 'model', channelId] });
    },
  });
  const job = useQuery({
    queryKey: ['radar', 'job', jobId],
    enabled: Boolean(jobId),
    queryFn: async ({ signal }) => {
      const data = await getJson<RadarJobResponse>(`/radar/jobs/${encodeURIComponent(jobId)}`, signal);
      if (data.status === 'done') void client.invalidateQueries({ queryKey: ['radar', 'model', channelId] });
      return data;
    },
    refetchInterval: query => (query.state.data?.status === 'running' ? 1500 : false),
  });
  const current = model.data?.current;
  const holdout = current?.metrics?.holdout;
  return (
    <>
      <section className="dashboard-card">
        <h2>Run calibration</h2>
        <p>
          Backtest synced history and competitors. The oldest 70% trains the model; the newest 30% tests it. No AI calls are requested. Existing cached features
          can still be used by the API.
        </p>
        <form
          className="filters"
          onSubmit={e => {
            e.preventDefault();
            start.mutate();
          }}
        >
          <label>
            Minimum video age (days)
            <input
              type="number"
              min="3"
              max="120"
              required
              value={minAgeDays}
              onChange={e => {
                const value = e.target.valueAsNumber;
                if (Number.isFinite(value)) setMinAgeDays(value);
              }}
            />
          </label>
          <button type="submit" className="primary-button" disabled={start.isPending || job.data?.status === 'running' || (Boolean(jobId) && job.isPending)}>
            Calibrate on my history
          </button>
        </form>
        {start.isError ? <QueryError error={start.error} retry={() => start.mutate()} /> : null}
        {jobId && job.isPending ? <p role="status">Loading calibration progress…</p> : null}
        {job.isError ? <QueryError error={job.error} retry={() => void job.refetch()} /> : null}
        {job.data ? (
          <p role={job.data.status === 'failed' ? 'alert' : 'status'}>
            {job.data.status === 'failed'
              ? job.data.error
              : `${job.data.status} · ${job.data.progress.stage || ''} · ${format(job.data.progress.done)} / ${format(job.data.progress.total)}`}
          </p>
        ) : null}
      </section>
      <section className="dashboard-card">
        <h2>Calibration results</h2>
        {model.isPending ? (
          <p role="status">Loading model…</p>
        ) : model.isError ? (
          <QueryError error={model.error} retry={() => void model.refetch()} />
        ) : !current?.calibrated ? (
          <p>No calibration yet. Generic prior weights are in use.</p>
        ) : (
          <>
            <p>
              Calibrated {timestamp(current.createdAt)} · {format(current.nTrain)} training videos
            </p>
            {holdout?.available ? (
              <>
                <div className="metrics">
                  <StatCard label="Rank accuracy (Spearman)" value={format(holdout.spearman)} note={holdout.verdict || 'Unknown'} />
                  <StatCard
                    label="Top-quartile hit rate"
                    value={`${format((holdout.topQuartileHitRate || 0) * 100)}%`}
                    note={`Base ${format((holdout.baseHitRate || 0) * 100)}% · lift ${times(holdout.lift)}`}
                  />
                  <StatCard label="Top / bottom quartile outcome" value={times(holdout.topVsBottomMedianX)} note="Median outcome ratio" />
                  <StatCard
                    label="Breakouts caught"
                    value={`${format(holdout.breakoutsInTopHalf)} / ${format(holdout.breakoutsInTest)}`}
                    note="≥2× videos ranked in top half"
                  />
                </div>
                <p>
                  Holdout: {format(holdout.train)} older training videos, {format(holdout.test)} newer test videos. Error {format(holdout.maeLog2)} vs{' '}
                  {format(holdout.maeNaiveLog2)} baseline (log₂ units).
                </p>
              </>
            ) : (
              <p>{holdout?.reason || 'No holdout metrics available.'}</p>
            )}
            {current.metrics ? (
              <p>
                Sample: {format(current.metrics.sample.labelled)} videos · {format(current.metrics.sample.own)} yours ·{' '}
                {format(current.metrics.sample.competitors)} competitors.
              </p>
            ) : null}
            {current.metrics?.noSignal ? <p>No positive signal found. The model retains prior weights.</p> : null}
            <Table caption="Data-derived model metrics">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Correlation with outcome</th>
                  <th scope="col">Sample</th>
                </tr>
              </thead>
              <tbody>
                {dataAxes.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{format((current.weights[key] || 0) * 100)}%</td>
                    <td>{format(current.axes?.[key]?.rho)}</td>
                    <td>{format(current.axes?.[key]?.n)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </section>
      {model.data?.history.length ? (
        <section className="dashboard-card">
          <h2>Calibration history</h2>
          <Table caption="Past calibration results">
            <thead>
              <tr>
                {['When', 'Videos', 'Spearman', 'Verdict'].map(c => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.data.history.map(m => (
                <tr key={m.id}>
                  <td>{timestamp(m.createdAt)}</td>
                  <td>{format(m.nTrain)}</td>
                  <td>{format(m.metrics?.holdout.spearman)}</td>
                  <td>{m.metrics?.holdout.verdict || m.metrics?.holdout.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}
    </>
  );
}
function ChannelRadar({ channelId }: { channelId: string }) {
  const [tab, setTab] = useState('Live watch');
  return (
    <>
      <Tabs labels={['Live watch', 'Calibration']} value={tab} onChange={setTab} />
      {tab === 'Live watch' ? <LiveWatch channelId={channelId} /> : <Calibration channelId={channelId} />}
    </>
  );
}
export function Radar() {
  const channel = useOwnedChannel();
  return (
    <div>
      <PageHeader
        title="Virality radar"
        description="Compare live views with the usual launch pace. Inspect breakouts and backtest the model on synced history."
      />
      <Link className="classic-link" to="/settings">
        Watch & quota settings →
      </Link>
      {channel.channels.isPending ? (
        <p role="status">Loading owned channels…</p>
      ) : channel.channels.isError ? (
        <QueryError error={channel.channels.error} retry={() => void channel.channels.refetch()} />
      ) : !channel.current ? (
        <p>Add an owned channel to use the radar.</p>
      ) : (
        <>
          <ChannelSelect channel={channel} />
          <ChannelRadar key={channel.current.id} channelId={channel.current.id} />
        </>
      )}
    </div>
  );
}
