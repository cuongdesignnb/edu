"use client";
import { use } from "react";
import { conductRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { QueryState } from "@/components/ui/states";
import { RuleSetEditor } from "@/features/school-ops/rule-editor";

/** SC30 — Soạn bộ nội quy (bản nháp) / xem phiên bản đã ban hành. */
export default function Page({ params }: { params: Promise<{ schoolId: string; ruleSetId: string }> }) {
  const { schoolId, ruleSetId } = use(params);
  const q = useRepo(["rule-set", schoolId, ruleSetId], (c) => conductRepo.ruleSet(c, schoolId, ruleSetId));
  return <QueryState query={q} skeleton="form">{(d) => <RuleSetEditor key={`${d.ruleSet.id}-${d.ruleSet.status}`} schoolId={schoolId} data={d} />}</QueryState>;
}
