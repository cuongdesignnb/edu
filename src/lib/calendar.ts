import {serverNowISO,serverToday} from './api/session';
export const demoNowISO=serverNowISO;
export const demoToday=serverToday;
export const demoNow=()=>new Date(serverNowISO());
export function toLocalDate(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3600_000);
  return t.toISOString().slice(0, 10);
}

/** Build an ISO datetime at +07:00 from a local date and HH:mm. */
export function localDateTime(date: string, hhmm = "08:00"): string {
  return `${date}T${hhmm}:00+07:00`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400_000);
}

/** ISO weekday 1 (Mon) … 7 (Sun) of a yyyy-MM-dd date. */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(date: string): string {
  return addDays(date, 1 - weekdayOf(date));
}

export function addMinutesISO(iso: string, minutes: number): string {
  const t = Date.parse(iso) + minutes * 60_000;
  const local = new Date(t + 7 * 3600_000).toISOString().slice(0, 19);
  return `${local}+07:00`;
}
