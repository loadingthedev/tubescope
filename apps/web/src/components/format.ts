export const format = (value: number | null | undefined) => (value == null ? '—' : value.toLocaleString());
export const times = (value: number | null | undefined) => (value == null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}×`);
export const ageDays = (date: string) => Math.max(1, (Date.now() - new Date(date).getTime()) / 86400000);
