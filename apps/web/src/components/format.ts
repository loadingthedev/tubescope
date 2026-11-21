export const format = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 });
export const times = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toLocaleString(undefined, value < 1 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 1 })}×`;
export const ageDays = (date: string) => Math.max(1, (Date.now() - new Date(date).getTime()) / 86400000);
export const duration = (seconds: number) => {
  const value = Math.round(seconds);
  return value >= 3600
    ? `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
    : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
export const timestamp = (value: string | null) =>
  value ? new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + 'Z' : value).toLocaleString() : 'Never';
