import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { EarningsResponse, RpmBands, ValuationResponse } from '@tubescope/shared';
import { getJson, mutateJson } from './api';
import { PageHeader, Table } from './components/research';
import { DataSection } from './components/data-section';
import { format } from './components/format';
export function Calculators() {
  const bands = useQuery({ queryKey: ['rpm-bands'], queryFn: ({ signal }) => getJson<RpmBands>('/calc/rpm-bands', signal) });
  const earnings = useMutation({ mutationFn: (body: unknown) => mutateJson<EarningsResponse>('/calc/earnings', 'POST', body) });
  const valuation = useMutation({ mutationFn: (body: unknown) => mutateJson<ValuationResponse>('/calc/valuation', 'POST', body) });
  return (
    <>
      <PageHeader title="Calculators" description="Scenario estimates in USD. These do not measure your actual revenue or channel value." />
      <Card>
        <CardHeader>
          <CardTitle>Earnings scenario (est.)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="calculators-field-1">Niche band</FieldLabel>
                      <Select onValueChange={() => earnings.reset()} name="niche" defaultValue={Object.keys(data)[0]}>
                        <SelectTrigger id="calculators-field-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {Object.keys(data).map(n => (
                              <SelectItem key={n} value={n}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    {[
                      ['views', 'Monthly views', '100000'],
                      ['rpmLow', 'RPM low USD (blank = niche band)', ''],
                      ['rpmHigh', 'RPM high USD (blank = niche band)', ''],
                      ['sponsorPerVideo', 'Sponsor USD per video', '0'],
                      ['videosPerMonth', 'Videos per month', '4'],
                      ['affiliateRpm', 'Affiliate USD per 1,000 views', '0'],
                    ].map(([name, label, value]) => (
                      <Field key={name}>
                        <FieldLabel htmlFor={`earnings-${name}`}>{label}</FieldLabel>
                        <Input
                          id={`earnings-${name}`}
                          name={name}
                          type="number"
                          min="0"
                          step="any"
                          defaultValue={value}
                          required={name !== 'rpmLow' && name !== 'rpmHigh'}
                        />
                      </Field>
                    ))}
                    <Button type="submit" disabled={earnings.isPending}>
                      {earnings.isPending ? <Spinner data-icon="inline-start" /> : null}Calculate estimates
                    </Button>
                  </FieldGroup>
                </form>
                <h3 className="text-base font-semibold">Typical RPM bands (est.)</h3>
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
            <Alert variant="destructive">
              <AlertDescription>{earnings.error.message}</AlertDescription>
              <Button variant="outline" size="sm" onClick={() => earnings.mutate(earnings.variables)}>
                Try again
              </Button>
            </Alert>
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Channel valuation scenario (est.)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            onChange={() => valuation.reset()}
            onSubmit={e => {
              e.preventDefault();
              valuation.mutate(Object.fromEntries([...new FormData(e.currentTarget)].map(([k, v]) => [k, Number(v)])));
            }}
          >
            <FieldGroup>
              {[
                ['monthlyRevenue', 'Monthly profit USD', '1000'],
                ['multipleLow', 'Low multiple (months)', '24'],
                ['multipleHigh', 'High multiple (months)', '48'],
              ].map(([name, label, value]) => (
                <Field key={name}>
                  <FieldLabel htmlFor={`valuation-${name}`}>{label}</FieldLabel>
                  <Input id={`valuation-${name}`} type="number" name={name} min="0" step="any" defaultValue={value} required />
                </Field>
              ))}
              <Button type="submit" disabled={valuation.isPending}>
                {valuation.isPending ? <Spinner data-icon="inline-start" /> : null}Calculate valuation estimate
              </Button>
            </FieldGroup>
          </form>
          {valuation.isPending ? (
            <p role="status">Calculating…</p>
          ) : valuation.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{valuation.error.message}</AlertDescription>
              <Button variant="outline" size="sm" onClick={() => valuation.mutate(valuation.variables)}>
                Try again
              </Button>
            </Alert>
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
        </CardContent>
      </Card>
    </>
  );
}
