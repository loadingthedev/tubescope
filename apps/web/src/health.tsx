import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia, EmptyDescription } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupCreatedResponse, BackupsResponse, HealthResponse, QuotaResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, StatCard, StatGrid, Table } from './components/research';
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
    <>
      <PageHeader title="Health" description="Local database, data access, quota, backups and last scheduled job runs." />
      <Card>
        <CardHeader>
          <CardTitle>Status items</CardTitle>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-4">
          <Button type="button" variant="outline" disabled={health.isFetching} onClick={() => void health.refetch()}>
            Refresh status
          </Button>
          {health.isError ? (
            <QueryError error={health.error} retry={() => void health.refetch()} />
          ) : health.isPending ? (
            <div role="status" className="flex w-full flex-col gap-2">
              <span className="sr-only">Checking status…</span>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <StatGrid>
                <StatCard label="Status" value={health.data.status} note={timestamp(health.data.at)} />
                <StatCard label="Problems" value={format(health.data.errors)} note="Reported by the health API" />
                <StatCard label="Warnings" value={format(health.data.warnings)} note="Reported by the health API" />
              </StatGrid>
              {!health.data.items.length ? (
                <Empty className="w-full border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox />
                    </EmptyMedia>
                    <EmptyTitle>No results</EmptyTitle>
                    <EmptyDescription>No status items reported.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
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
                        <td>
                          <Badge variant={item.level === 'error' ? 'destructive' : 'secondary'}>{item.level}</Badge>
                        </td>
                        <th scope="row">{item.title}</th>
                        <td>
                          {item.detail}
                          {item.fix ? <p className="text-sm text-muted-foreground">{item.fix}</p> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Quota history</CardTitle>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-4">
          {quota.isError ? (
            <QueryError error={quota.error} retry={() => void quota.refetch()} />
          ) : quota.isPending ? (
            <div role="status" className="flex w-full flex-col gap-2">
              <span className="sr-only">Loading quota history…</span>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <p>
                {format(quota.data.today.units)} / {format(quota.data.today.limit)} units today · {format(quota.data.today.remaining)} remaining
              </p>
              <LineChart label="Daily YouTube API quota units" points={[...quota.data.history].reverse().map(day => ({ day: day.day, value: day.units }))} />
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Backups</CardTitle>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-4">
          <Button type="button" variant="outline" disabled={backup.isPending} onClick={() => backup.mutate()}>
            {backup.isPending ? <Spinner data-icon="inline-start" /> : null}
            {backup.isPending ? 'Backing up…' : 'Back up now'}
          </Button>
          {backup.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{backup.error.message}</AlertDescription>
            </Alert>
          ) : backup.data ? (
            <p role="status">Saved {backup.data.created}</p>
          ) : null}
          {backups.isError ? (
            <QueryError error={backups.error} retry={() => void backups.refetch()} />
          ) : backups.isPending ? (
            <div role="status" className="flex w-full flex-col gap-2">
              <span className="sr-only">Loading backups…</span>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{backups.data.dir}</p>
              {!backups.data.backups.length ? (
                <Empty className="w-full border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox />
                    </EmptyMedia>
                    <EmptyTitle>No results</EmptyTitle>
                    <EmptyDescription>No backups yet. A scheduled backup is made nightly.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
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
              <p className="text-sm text-muted-foreground">The API does not offer backup downloads.</p>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Last job runs</CardTitle>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-4">
          {health.isError ? (
            <QueryError error={health.error} retry={() => void health.refetch()} />
          ) : health.isPending ? (
            <div role="status" className="flex w-full flex-col gap-2">
              <span className="sr-only">Loading job runs…</span>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !health.data.jobs.length ? (
            <Empty className="w-full border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>No jobs registered.</EmptyDescription>
              </EmptyHeader>
            </Empty>
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
        </CardContent>
      </Card>
    </>
  );
}
