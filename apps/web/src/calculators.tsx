import { useMutation, useQuery } from '@tanstack/react-query';
import type { EarningsResponse, RpmBands, ValuationResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, QueryError, Table } from './components/research';
import { DataSection } from './components/data-section';
import { format } from './components/format';
export function Calculators() {
  const bands = useQuery({ queryKey: ['rpm-bands'], queryFn: ({ signal }) => getJson<RpmBands>('/calc/rpm-bands', signal) });
  const earnings = useMutation({ mutationFn: (body: unknown) => mutateJson<EarningsResponse>('/calc/earnings', 'POST', body) });
  const valuation = useMutation({ mutationFn: (body: unknown) => mutateJson<ValuationResponse>('/calc/valuation', 'POST', body) });
  return (
    <div className="research-page">
      <PageHeader title="Calculators" description="Scenario estimates in USD. These do not measure your actual revenue or channel value." />
      <section className="dashboard-card">
        <h2>Earnings scenario (est.)</h2>
        <DataSection query={bands}>
          {data => (
            <>
              <form
                onChange={() => earnings.reset()}
                onSubmit={e => {
                  e.preventDefault();
                  const values = Object.fromEntries(new FormData(e.currentTarget));
                  earnings.mutate(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, k === 'niche' ? v : v === '' ? null : Number(v)])));
                }}
              >
                <label>
                  Niche band
                  <select name="niche">
                    {Object.keys(data).map(n => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                {[
                  ['views', 'Monthly views', '100000'],
                  ['rpmLow', 'RPM low USD (blank = niche band)', ''],
                  ['rpmHigh', 'RPM high USD (blank = niche band)', ''],
                  ['sponsorPerVideo', 'Sponsor USD per video', '0'],
                  ['videosPerMonth', 'Videos per month', '4'],
                  ['affiliateRpm', 'Affiliate USD per 1,000 views', '0'],
                ].map(([name, label, value]) => (
                  <label key={name}>
                    {label}
                    <input name={name} type="number" min="0" step="any" defaultValue={value} required={name !== 'rpmLow' && name !== 'rpmHigh'} />
                  </label>
                ))}
                <button type="submit" disabled={earnings.isPending}>
                  Calculate estimates
                </button>
              </form>
              <h3>Typical RPM bands (est.)</h3>
              <Table caption="RPM estimates">
                <thead>
                  <tr>
                    <th scope="col">Niche</th>
                    <th scope="col">RPM range USD (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data).map(([n, r]) => (
                    <tr key={n}>
                      <th scope="row">{n}</th>
                      <td>
                        ${format(r[0])} – ${format(r[1])} (est.)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </DataSection>
        {earnings.isPending ? (
          <p role="status">Calculating…</p>
        ) : earnings.isError ? (
          <QueryError error={earnings.error} retry={() => earnings.mutate(earnings.variables)} />
        ) : earnings.data ? (
          <div role="status">
            <p>
              Ad revenue (est.): low ${format(earnings.data.adRevenue.low)} · mid ${format(earnings.data.adRevenue.mid)} · high $
              {format(earnings.data.adRevenue.high)}
            </p>
            <p>
              Sponsorships (est.): ${format(earnings.data.sponsorships)} · Affiliate (est.): ${format(earnings.data.affiliate)}
            </p>
            <p>
              Total range (est.): ${format(earnings.data.total.low)} – ${format(earnings.data.total.high)}
            </p>
            <p>{earnings.data.disclaimer}</p>
          </div>
        ) : (
          <p>Enter inputs to calculate an estimate.</p>
        )}
      </section>
      <section className="dashboard-card">
        <h2>Channel valuation scenario (est.)</h2>
        <form
          onChange={() => valuation.reset()}
          onSubmit={e => {
            e.preventDefault();
            valuation.mutate(Object.fromEntries([...new FormData(e.currentTarget)].map(([k, v]) => [k, Number(v)])));
          }}
        >
          {[
            ['monthlyRevenue', 'Monthly profit USD', '1000'],
            ['multipleLow', 'Low multiple (months)', '24'],
            ['multipleHigh', 'High multiple (months)', '48'],
          ].map(([name, label, value]) => (
            <label key={name}>
              {label}
              <input type="number" name={name} min="0" step="any" defaultValue={value} required />
            </label>
          ))}
          <button type="submit" disabled={valuation.isPending}>
            Calculate valuation estimate
          </button>
        </form>
        {valuation.isPending ? (
          <p role="status">Calculating…</p>
        ) : valuation.isError ? (
          <QueryError error={valuation.error} retry={() => valuation.mutate(valuation.variables)} />
        ) : valuation.data ? (
          <div role="status">
            <p>
              Value range (est.): ${format(valuation.data.low)} – ${format(valuation.data.high)}
            </p>
            <p>{valuation.data.disclaimer}</p>
          </div>
        ) : (
          <p>Enter inputs to calculate an estimate.</p>
        )}
      </section>
    </div>
  );
}
