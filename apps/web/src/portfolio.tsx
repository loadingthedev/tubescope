import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { PortfolioResponse, WeeklySummaryResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, StatCard } from './components/research';
import { DataSection } from './components/data-section';
import { format, times, timestamp } from './components/format';
export function Portfolio() {
  const query = useQuery({ queryKey: ['portfolio'], queryFn: ({ signal }) => getJson<PortfolioResponse>('/portfolio', signal) });
  const summary = useMutation({ mutationFn: () => mutateJson<WeeklySummaryResponse>('/portfolio/weekly-summary', 'POST', { send: true }) });
  return (
    <div className="research-page">
      <PageHeader
        title="All channels"
        description="Owned-channel summaries. Weekly comparisons use stored snapshots; missing history is shown as unavailable."
      />
      <button type="button" disabled={summary.isPending} onClick={() => summary.mutate()}>
        {summary.isPending ? 'Sending…' : 'Send weekly summary via configured notifications'}
      </button>
      {summary.isError ? (
        <QueryError error={summary.error} retry={() => summary.mutate()} />
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
              <p>
                No owned channels. <Link to="/channels">Add a channel</Link>.
              </p>
            ) : (
              data.channels.map(c => (
                <section key={c.id} className="dashboard-card">
                  <h2>{c.title}</h2>
                  <div className="metrics">
                    <StatCard
                      label="Views · 7 days"
                      value={format(c.views7)}
                      note={`Prior 7 days: ${format(c.views7Prev)} · ${c.views7Change == null ? 'Change unavailable' : `${format(c.views7Change * 100)}% change`}`}
                    />
                    <StatCard label="Subscribers" value={format(c.subscribers)} note={`7-day change: ${format(c.subs7)}`} />
                    <StatCard label="Uploads · 30 days" value={format(c.uploads30)} note={`28-day CTR: ${format(c.ctr28)}%`} />
                  </div>
                  <h3>Latest upload</h3>
                  {c.latest ? (
                    <p>
                      <Link to={`/library/${encodeURIComponent(c.latest.id)}`}>{c.latest.title}</Link> · {c.latest.is_short ? 'Shorts' : 'Long-form'} ·{' '}
                      {timestamp(c.latest.published_at)} · pace {times(c.latest.pace)} (est.)
                    </p>
                  ) : (
                    <p>No synced uploads.</p>
                  )}
                  <h3>Monetization progress</h3>
                  {c.ypp ? (
                    <p>
                      Watch hours (est.): {format(c.ypp.watchHours)} / 4,000 · subscribers: {format(c.ypp.subs)} / 1,000. Watch hours include Shorts; YouTube
                      excludes Shorts watch time for YPP.
                    </p>
                  ) : (
                    <p>Progress unavailable. Connect with Google in Channels to read watch hours.</p>
                  )}
                </section>
              ))
            )}
          </>
        )}
      </DataSection>
    </div>
  );
}
