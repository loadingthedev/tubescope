import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupCreatedResponse, BackupsResponse, HealthResponse, QuotaResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, StatCard, Table } from './components/research';
import { LineChart } from './components/line-chart';
import { format, timestamp } from './components/format';

export function Health() {
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => getJson<HealthResponse>('/health', signal) });
  const backups = useQuery({ queryKey: ['backups'], queryFn: ({ signal }) => getJson<BackupsResponse>('/backups', signal) });
  const quota = useQuery({ queryKey: ['quota'], queryFn: ({ signal }) => getJson<QuotaResponse>('/quota', signal) });
  const client = useQueryClient();
  const backup = useMutation({
    mutationFn: () => mutateJson<BackupCreatedResponse>('/backups', 'POST', {}),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['backups'] });
      await client.invalidateQueries({ queryKey: ['health'] });
    },
  });
  return (
    <div className="health-page">
      <PageHeader title="Health" description="Local database, data access, quota, backups and last scheduled job runs." />
      <section className="dashboard-card">
        <h2>Status items</h2>
        <button type="button" className="secondary-button" disabled={health.isFetching} onClick={() => void health.refetch()}>
          Refresh status
        </button>
        {health.isError ? (
          <QueryError error={health.error} retry={() => void health.refetch()} />
        ) : health.isPending ? (
          <p role="status">Checking status…</p>
        ) : (
          <>
            <div className="metrics">
              <StatCard label="Status" value={health.data.status} note={timestamp(health.data.at)} />
              <StatCard label="Problems" value={format(health.data.errors)} note="Reported by the health API" />
              <StatCard label="Warnings" value={format(health.data.warnings)} note="Reported by the health API" />
            </div>
            {!health.data.items.length ? (
              <p>No status items reported.</p>
            ) : (
              <Table caption="Health status items">
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Item</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {health.data.items.map(item => (
                    <tr key={item.id}>
                      <td>{item.level}</td>
                      <th scope="row">{item.title}</th>
                      <td>
                        {item.detail}
                        {item.fix ? <p className="muted">{item.fix}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </section>
      <section className="dashboard-card">
        <h2>Quota history</h2>
        {quota.isError ? (
          <QueryError error={quota.error} retry={() => void quota.refetch()} />
        ) : quota.isPending ? (
          <p role="status">Loading quota history…</p>
        ) : (
          <>
            <p>
              {format(quota.data.today.units)} / {format(quota.data.today.limit)} units today · {format(quota.data.today.remaining)} remaining
            </p>
            <LineChart label="Daily YouTube API quota units" points={[...quota.data.history].reverse().map(day => ({ day: day.day, value: day.units }))} />
          </>
        )}
      </section>
      <section className="dashboard-card">
        <h2>Backups</h2>
        <button type="button" className="secondary-button" disabled={backup.isPending} onClick={() => backup.mutate()}>
          {backup.isPending ? 'Backing up…' : 'Back up now'}
        </button>
        {backup.isError ? (
          <p role="alert" className="error-message">
            {backup.error.message}
          </p>
        ) : backup.data ? (
          <p role="status">Saved {backup.data.created}</p>
        ) : null}
        {backups.isError ? (
          <QueryError error={backups.error} retry={() => void backups.refetch()} />
        ) : backups.isPending ? (
          <p role="status">Loading backups…</p>
        ) : (
          <>
            <p className="muted">{backups.data.dir}</p>
            {!backups.data.backups.length ? (
              <p>No backups yet. A scheduled backup is made nightly.</p>
            ) : (
              <Table caption="Local backups">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Size</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.data.backups.map(item => (
                    <tr key={item.file}>
                      <th scope="row">{item.file}</th>
                      <td>{format(item.bytes / 1e6)} MB</td>
                      <td>{timestamp(item.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <p className="muted">The API does not offer backup downloads.</p>
          </>
        )}
      </section>
      <section className="dashboard-card">
        <h2>Last job runs</h2>
        {health.isError ? (
          <QueryError error={health.error} retry={() => void health.refetch()} />
        ) : health.isPending ? (
          <p role="status">Loading job runs…</p>
        ) : !health.data.jobs.length ? (
          <p>No jobs registered.</p>
        ) : (
          <Table caption="Last scheduled job runs">
            <thead>
              <tr>
                {['Job', 'Schedule', 'Last run', 'Last OK', 'State / last error'].map(label => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {health.data.jobs.map(job => (
                <tr key={job.name}>
                  <th scope="row">{job.label}</th>
                  <td>{job.schedule}</td>
                  <td>{timestamp(job.lastRun)}</td>
                  <td>{timestamp(job.lastOk)}</td>
                  <td>
                    {job.running ? 'Running' : job.lastError || 'Idle'}
                    {job.failuresInARow ? ` · ${format(job.failuresInARow)} consecutive failures` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
