import type { ConductRecord, GradeBand, RuleSet, SnapshotRow, Student, ID } from "@/lib/model/types";

/** Records that count toward the total: approved, or pending when previewing. */
export function countingRecords(records: ConductRecord[], opts: { includePending: boolean }): ConductRecord[] {
  return records.filter((r) => r.status === "approved" || (opts.includePending && r.status === "pending_review"));
}

export function gradeFor(total: number, bands: GradeBand[]): GradeBand {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => total >= b.min) ?? sorted[sorted.length - 1];
}

export function applyLimits(raw: number, ruleSet: Pick<RuleSet, "cap" | "floor">): number {
  let t = raw;
  if (ruleSet.cap !== undefined) t = Math.min(t, ruleSet.cap);
  if (ruleSet.floor !== undefined) t = Math.max(t, ruleSet.floor);
  return t;
}

export function ruleLabel(ruleSets: RuleSet[], ruleSetId: ID, ruleId: ID): string {
  const rs = ruleSets.find((r) => r.id === ruleSetId);
  return rs?.rules.find((x) => x.id === ruleId)?.label ?? "Quy định không còn áp dụng";
}

/**
 * Deterministic per-student computation: base + Σplus + Σminus, with optional cap/floor.
 * Example (fixture v1): 100 − 5 + 2 = 97.
 */
export function computeRows(
  roster: Pick<Student, "id" | "fullName" | "code">[],
  records: ConductRecord[],
  ruleSet: RuleSet,
  allRuleSets: RuleSet[],
): SnapshotRow[] {
  return roster.map((s) => {
    const mine = records.filter((r) => r.studentId === s.id);
    const plus = mine.filter((r) => r.points > 0).reduce((a, r) => a + r.points, 0);
    const minus = mine.filter((r) => r.points < 0).reduce((a, r) => a + r.points, 0);
    const total = applyLimits(ruleSet.baseScore + plus + minus, ruleSet);
    const rsOf = (r: ConductRecord) => allRuleSets.find((x) => x.id === r.ruleSetId);
    return {
      studentId: s.id,
      studentName: s.fullName,
      studentCode: s.code,
      base: ruleSet.baseScore,
      plus,
      minus,
      total,
      grade: gradeFor(total, ruleSet.bands).label,
      items: mine
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => {
          const rule = rsOf(r)?.rules.find((x) => x.id === r.ruleId);
          return { recordId: r.id, date: r.date, label: rule?.label ?? r.reason, points: r.points, shareWithParent: rule?.shareWithParent ?? true };
        }),
    };
  });
}

/** Possible duplicates: same student + same rule + same date, or same source event key. */
export function findDuplicates(records: ConductRecord[]): Map<ID, ID[]> {
  const live = records.filter((r) => r.status !== "void" && r.status !== "rejected");
  const out = new Map<ID, ID[]>();
  for (const r of live) {
    const twins = live.filter(
      (o) =>
        o.id !== r.id &&
        o.studentId === r.studentId &&
        ((o.sourceEventKey && o.sourceEventKey === r.sourceEventKey) || (o.ruleId === r.ruleId && o.date === r.date)),
    );
    if (twins.length) out.set(r.id, twins.map((t) => t.id));
  }
  return out;
}
