// Dates for schedules are plain YYYY-MM-DD in London time.

export const todayLondon = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

const parse = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());

export function addDays(d: string, n: number) {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
}

export type Unit = 'day' | 'week' | 'month' | 'year';

export function addInterval(d: string, n: number, unit: Unit) {
  if (unit === 'day') return addDays(d, n);
  if (unit === 'week') return addDays(d, n * 7);
  const x = parse(d);
  const months = unit === 'year' ? n * 12 : n;
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + months);
  // 31 Jan + 1 month = 28/29 Feb, not 3 Mar.
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return iso(x);
}

export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export const fmtDate = (d: string | null) =>
  d ? parse(d).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const everyLabel = (n: number, unit: Unit) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`);
