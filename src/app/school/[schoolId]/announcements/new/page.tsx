"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page";
import { DeniedState } from "@/components/ui/states";
import { useSchool } from "@/components/layout/shells";
import { AnnouncementComposer } from "@/features/announcements/composer";

/** SC34 — Soạn thông báo trường. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  const router = useRouter();
  const { can } = useSchool();
  const base = `/school/${schoolId}/announcements`;
  return (
    <div className="page">
      <PageHeader title="Soạn thông báo" subtitle="Nội dung có cấu trúc, chọn đúng người nhận, xem trước như phụ huynh trước khi công bố"
        breadcrumbs={[{ label: "Thông báo", href: base }, { label: "Soạn mới" }]} />
      {can("announcement.school")
        ? <AnnouncementComposer schoolId={schoolId} origin="school" onDone={(id) => router.push(`${base}/${id}`)} onCancel={() => router.push(base)} />
        : <div className="card"><DeniedState message="Bạn không có quyền soạn thông báo nhà trường." /></div>}
    </div>
  );
}
