import { SearchX, Send } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OutlierMark } from './components/outlier-mark';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { PortfolioResponse, WeeklySummaryResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, StatCard, StatGrid } from './components/research';
import { DataSection } from './components/data-section';
import { format, timestamp } from './components/format';
export function Portfolio() {
  const query = useQuery({ queryKey: ['portfolio'], queryFn: ({ signal }) => getJson<PortfolioResponse>('/portfolio', signal) });
  const summary = useMutation({ mutationFn: () => mutateJson<WeeklySummaryResponse>('/portfolio/weekly-summary', 'POST', { send: true }) });
  return (
    <>
      <PageHeader
        title="All channels"
        description="Owned-channel summaries. Weekly comparisons use stored snapshots; missing history is shown as unavailable."
        actions={
          <Button type="button" title="Sends through the notifications set up in Settings" disabled={summary.isPending} onClick={() => summary.mutate()}>
            {summary.isPending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            {summary.isPending ? 'Sending…' : 'Send weekly summary'}
          </Button>
        }
      />
      {summary.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{summary.error.message}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => summary.mutate()}>
            Try again
          </Button>
        </Alert>
      ) : summary.data ? (
        <p role="status">
          {summary.data.sent?.skipped ||
            (summary.data.sent?.held
              ? 'Summary held for quiet hours.'
              : summary.data.sent?.sent?.length
                ? `Sent via ${summary.data.sent.sent.join(', ')}.`
                : summary.data.sent?.errors?.join('; ') || 'No notification sent. Check configured notifications in Settings.')}
          <br />
          {summary.data.text}
        </p>
      ) : null}
      <DataSection query={query}>
        {data => (
          <>
            <p>Generated {timestamp(data.generatedAt)}</p>
            {!data.channels.length ? (
              <Empty className="border bg-card">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchX />
                  </EmptyMedia>
                  <EmptyTitle>No owned channels</EmptyTitle>
                  <EmptyDescription>
                    No owned channels. <Link to="/channels">Add a channel</Link>.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              data.channels.map(c => (
                <Card key={c.id}>
                  <CardHeader>
                    <CardTitle>{c.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <StatGrid>
                      <StatCard
                        label="Views · 7 days"
                        value={format(c.views7)}
                        note={`Prior 7 days: ${format(c.views7Prev)} · ${c.views7Change == null ? 'Change unavailable' : `${format(c.views7Change * 100)}% change`}`}
                      />
                      <StatCard label="Subscribers" value={format(c.subscribers)} note={`7-day change: ${format(c.subs7)}`} />
                      <StatCard label="Uploads · 30 days" value={format(c.uploads30)} note={`28-day CTR: ${format(c.ctr28)}%`} />
                    </StatGrid>
                    <h3 className="text-base font-semibold">Latest upload</h3>
                    {c.latest ? (
                      <p>
                        <Link to="/library/$videoId" params={{ videoId: c.latest.id }}>
                          {c.latest.title}
                        </Link>{' '}
                        · {c.latest.is_short ? 'Shorts' : 'Long-form'} · {timestamp(c.latest.published_at)} · pace <OutlierMark value={c.latest.pace} /> (est.)
                      </p>
                    ) : (
                      <p>No synced uploads.</p>
                    )}
                    <h3 className="text-base font-semibold">Monetization progress</h3>
                    {c.ypp ? (
                      <p>
                        Watch hours (est.): {format(c.ypp.watchHours)} / 4,000 · subscribers: {format(c.ypp.subs)} / 1,000. Watch hours include Shorts; YouTube
                        excludes Shorts watch time for YPP.
                      </p>
                    ) : (
                      <p>Progress unavailable. Connect with Google in Channels to read watch hours.</p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </>
        )}
      </DataSection>
    </>
  );
}
