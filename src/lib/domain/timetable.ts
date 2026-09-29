export const PERIODS: { period: number; start: string; end: string; session: "morning" | "afternoon" }[] = [
  { period: 1, start: "07:00", end: "07:45", session: "morning" },
  { period: 2, start: "07:50", end: "08:35", session: "morning" },
  { period: 3, start: "08:50", end: "09:35", session: "morning" },
  { period: 4, start: "09:40", end: "10:25", session: "morning" },
  { period: 5, start: "10:30", end: "11:15", session: "morning" },
  { period: 6, start: "13:30", end: "14:15", session: "afternoon" },
  { period: 7, start: "14:20", end: "15:05", session: "afternoon" },
];

export function periodTime(p: number): { start: string; end: string } {
  const x = PERIODS.find((q) => q.period === p);
  return x ? { start: x.start, end: x.end } : { start: "--:--", end: "--:--" };
}

export const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6];
