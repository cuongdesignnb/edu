"use client";
import { use } from "react";
import { RoleDetail } from "@/features/school-org/roles";

/** SC14 — Chi tiết mẫu quyền. */
export default function Page({ params }: { params: Promise<{ schoolId: string; roleId: string }> }) {
  const { roleId } = use(params);
  return <RoleDetail roleId={roleId} />;
}
