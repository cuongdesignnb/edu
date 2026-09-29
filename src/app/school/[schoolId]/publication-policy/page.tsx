"use client";
import { use } from "react";
import { conductRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { QueryState } from "@/components/ui/states";
import { PolicyForm } from "@/features/school-ops/policy-form";

/** SC31 — Quy trình chốt và công bố. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  const q = useRepo(["publication-policy", schoolId], (c) => conductRepo.policy(c, schoolId));
  return (
    <div className="page">
      <PageHeader title="Quy trình chốt và công bố" subtitle="Ai chốt, ai công bố, có cần duyệt và phụ huynh được xem những mục nào" />
      <QueryState query={q} skeleton="form">{(d) => <PolicyForm key={d.policy.version} schoolId={schoolId} data={d} />}</QueryState>
    </div>
  );
}
