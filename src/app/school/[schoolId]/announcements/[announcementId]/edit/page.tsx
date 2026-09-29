"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { announcementsRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { Callout } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { DeniedState, QueryState } from "@/components/ui/states";
import { AnnouncementComposer } from "@/features/announcements/composer";

/** SC35 — sửa thông báo nhà trường (nháp / đã đặt lịch). */
export default function Page({ params }: { params: Promise<{ schoolId: string; announcementId: string }> }) {
  const { schoolId, announcementId } = use(params);
  const router = useRouter();
  const base = `/school/${schoolId}/announcements`;
  const q = useRepo(["announcement", schoolId, announcementId], (c) => announcementsRepo.detail(c, schoolId, announcementId), { staleTime: 0 });
  return (
    <QueryState query={q} skeleton="form">
      {(a) => (
        <div className="page">
          <PageHeader title="Sửa thông báo" subtitle={a.title} breadcrumbs={[{ label: "Thông báo", href: base }, { label: a.title, href: `${base}/${a.id}` }, { label: "Sửa" }]} />
          {!a.canEdit || a.origin !== "school" ? <div className="card"><DeniedState message="Bạn không có quyền sửa thông báo này." /></div>
            : a.status === "withdrawn" ? <Callout tone="danger" icon={<Ban />} title="Thông báo đã thu hồi" action={<ButtonLink href={`${base}/new`} size="sm">Soạn thông báo mới</ButtonLink>}>Không sửa thông báo đã thu hồi — hãy tạo thông báo mới.</Callout>
            : <AnnouncementComposer key={`${a.id}-${a.version}`} schoolId={schoolId} origin="school" announcement={a} onDone={(id) => router.push(`${base}/${id}`)} onCancel={() => router.push(`${base}/${a.id}`)} />}
        </div>
      )}
    </QueryState>
  );
}
