"use client";
import { Suspense, use } from "react";
import { PageSkeleton } from "@/components/ui/states";
import { MemberDetail } from "@/features/school-org/member-detail";

/** SC11 — Hồ sơ và phân công giáo viên. */
export default function Page({ params }: { params: Promise<{ schoolId: string; memberId: string }> }) {
  const { memberId } = use(params);
  return <Suspense fallback={<PageSkeleton variant="detail" />}><MemberDetail membershipId={memberId} /></Suspense>;
}
