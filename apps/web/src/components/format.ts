export const format = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 });
export const times = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toLocaleString(undefined, value < 1 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 1 })}×`;
export const ageDays = (date: string) => Math.max(1, (Date.now() - new Date(date).getTime()) / 86400000);
