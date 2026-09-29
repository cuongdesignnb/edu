"use client";
import { use } from "react";
import { schoolRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { useSchool } from "@/components/layout/shells";
import { QueryState } from "@/components/ui/states";
import { SettingsForm } from "@/features/school-ops/settings-form";

/** SC41 — Cài đặt hiển thị và chia sẻ. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  const { school } = useSchool();
  const q = useRepo(["school-settings", schoolId], (c) => schoolRepo.settings(c, schoolId));
  return (
    <div className="page">
      <PageHeader title="Cài đặt hiển thị và chia sẻ" subtitle="Mặc định link tra cứu, thông tin giáo viên hiển thị cho phụ huynh và mẫu báo cáo" />
      <QueryState query={q} skeleton="form">{(d) => <SettingsForm key={d.settings.version} schoolId={schoolId} data={d} schoolName={school.name} />}</QueryState>
    </div>
  );
}
