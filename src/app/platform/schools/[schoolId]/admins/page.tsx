"use client";
import { use } from "react";
import { SchoolAdmins } from "@/features/platform/school-admins";

/** PL05 — school admins. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <SchoolAdmins schoolId={schoolId} />;
}
