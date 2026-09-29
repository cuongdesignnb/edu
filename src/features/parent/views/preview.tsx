"use client";
import { useMemo } from "react";
import { Eye, Info } from "lucide-react";
import { parentRepo, type ParentKey } from "@/lib/repositories";
import { useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { ParentShell, unavailableReason } from "@/features/parent/shell";
import { PageHeader } from "@/components/layout/page";
import { Callout, Card } from "@/components/ui/card";
import { DeniedState, EmptyState, PageSkeleton, ErrorState } from "@/components/ui/states";
import { ParentOverviewView } from "./overview";
import { ParentAttendanceView } from "./attendance";
import { ParentConductListView, ParentConductDetailView } from "./conduct";
import { ParentTimetableView } from "./timetable";
import { ParentDutiesView } from "./duties";
import { ParentActivitiesView, ParentActivityDetailView } from "./activities";
import { ParentAnnouncementsView, ParentAnnouncementDetailView } from "./announcements";
import { ParentTeachersView } from "./teachers";
import { ParentDocumentsView } from "./documents";
import { ParentError } from "./common";

/** Maps preview sub-routes (the same hrefs the parent nav builds) to the parent views. */
function PreviewRoute({ view }: { view: string[] }) {
  const [head, id] = view.map((v) => decodeURIComponent(v));
  switch (head) {
    case undefined: case "overview": return <ParentOverviewView />;
    case "attendance": return <ParentAttendanceView />;
    case "conduct": return id ? <ParentConductDetailView periodId={id} /> : <ParentConductListView />;
    case "timetable": return <ParentTimetableView />;
    case "duties": return <ParentDutiesView />;
    case "activities": return id ? <ParentActivityDetailView activityId={id} /> : <ParentActivitiesView />;
    case "announcements": return id ? <ParentAnnouncementDetailView announcementId={id} /> : <ParentAnnouncementsView />;
    case "teachers": return <ParentTeachersView />;
    case "documents": return <ParentDocumentsView />;
    default: return <ParentError error={{ code: "NOT_FOUND", message: "Không có mục này trong trang phụ huynh.", name: "RepoError" } as never} />;
  }
}

const REASON_TEXT: Record<string, string> = {
  revoked: "Link này đã bị thu hồi. Phụ huynh mở link sẽ thấy trang “Đường dẫn đã bị thu hồi”, không có thông tin học sinh.",
  expired: "Link này đã hết hạn. Phụ huynh mở link sẽ thấy trang “Đường dẫn đã hết hạn”, không có thông tin học sinh.",
  suspended: "Trường đang tạm dừng. Phụ huynh không mở được trang thông tin.",
  invalid: "Link không thuộc trường này.",
};

/** SC25 — staff preview of exactly what the parent sees through one link. Grants nothing. */
export function ParentPreviewView({ schoolId, accessId, view }: { schoolId: string; accessId: string; view: string[] }) {
  const ctx = useCtx();
  const { school } = useSchool();
  const key = useMemo<ParentKey>(() => ({ preview: { ctx, accessId } }), [ctx, accessId]);
  const base = `/school/${schoolId}/parent-access/${accessId}/preview`;
  // Gate first: the repository enforces parentAccess permission for the preview.
  const gate = useRepo(["parent-preview-gate", schoolId, accessId, school.slug], (c) => parentRepo.open({ preview: { ctx: c, accessId } }, school.slug), { staleTime: 0 });
  const reason = unavailableReason(gate.error);

  return (
    <div className="page">
      <PageHeader title="Xem trước trang phụ huynh" subtitle="Hiển thị đúng phần phụ huynh sẽ thấy qua link này — chỉ dữ liệu đã công bố và các mục được cấp"
        breadcrumbs={[{ label: school.shortName, href: `/school/${schoolId}` }, { label: "Link phụ huynh", href: `/school/${schoolId}/parent-access` }, { label: "Chi tiết link", href: `/school/${schoolId}/parent-access/${accessId}` }, { label: "Xem trước nội bộ" }]} />
      <Callout tone="neutral" icon={<Eye />} title="Xem trước nội bộ">Chế độ này không ghi lượt mở link, không cấp thêm quyền nào cho phụ huynh và không cho phép chỉnh sửa. Đường dẫn/mã link không hiển thị ở đây.</Callout>
      {gate.isLoading ? <PageSkeleton variant="parent" />
        : gate.error?.code === "FORBIDDEN" || gate.error?.code === "NO_SESSION" ? <Card><ErrorState error={gate.error} /></Card>
          : reason ? <Card><EmptyState icon={<Info className="size-6" />} title="Link hiện không sử dụng được" description={REASON_TEXT[reason] ?? REASON_TEXT.invalid} /></Card>
            : gate.error ? (gate.error.code === "NOT_FOUND" ? <Card><EmptyState title="Không tìm thấy link" description="Link không tồn tại hoặc không thuộc trường này." /></Card> : <Card><DeniedState message={gate.error.message} /></Card>)
              : (
                <div className="overflow-hidden rounded-2xl border-2 border-dashed border-[#c9b8ff]">
                  <ParentShell slug={school.slug} preview={{ key, base }}>
                    <PreviewRoute view={view} />
                  </ParentShell>
                </div>
              )}
    </div>
  );
}
