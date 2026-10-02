export interface SeatingLayout { rows: number; cols: number; seats: Record<string, string | null> }
type Plan = { rows?: number | null; cols?: number | null; seats: { seat: string; studentId: string | null }[] } | null;

export function initialSeatingLayout(plan: Plan, rows = 6, cols = 6): SeatingLayout {
  // A valid empty API revision has null dimensions; give it an editable grid.
  const r = plan?.rows ?? rows, c = plan?.cols ?? cols;
  const seats: SeatingLayout['seats'] = {};
  for (let i = 1; i <= r; i++) for (let j = 1; j <= c; j++) seats[`r${i}c${j}`] = null;
  plan?.seats.forEach(s => { if (s.seat in seats) seats[s.seat] = s.studentId; });
  return { rows: r, cols: c, seats };
}
export function resizeSeating(layout: SeatingLayout, rows: number, cols: number): SeatingLayout {
  const seats: SeatingLayout['seats'] = {};
  for (let i = 1; i <= rows; i++) for (let j = 1; j <= cols; j++) seats[`r${i}c${j}`] = layout.seats[`r${i}c${j}`] ?? null;
  return { rows, cols, seats };
}
export function moveStudent(layout: SeatingLayout, studentId: string, key: string): SeatingLayout {
  if (!(key in layout.seats)) return layout;
  const from = Object.keys(layout.seats).find(seat => layout.seats[seat] === studentId);
  if (from === key) return layout;
  const seats = { ...layout.seats }, occupant = seats[key];
  seats[key] = studentId;
  if (from) seats[from] = occupant ?? null;
  return { ...layout, seats };
}
export const sameSeating = (a: SeatingLayout, b: SeatingLayout) => a.rows === b.rows && a.cols === b.cols && Object.keys(a.seats).every(key => a.seats[key] === b.seats[key]);
