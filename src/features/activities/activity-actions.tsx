"use client";
import { activitiesRepo } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { fmtDate } from "@/lib/formatters";
import { useClassroom } from "@/features/classroom/context";
import { ConfirmDialog } from "@/components/ui/dialog";
import type {Activity} from '@/lib/model/types';

export type StatusIntent = { id: string; title: string; to: "active" | "closed"; activity:Activity; fromDraft?: boolean; dueDate?: string; assigned?: number };

/** Confirm close / reopen / publish-from-draft of an activity (setActivityStatus). */
export function ActivityStatusConfirm({ intent, onClose }: { intent: StatusIntent | null; onClose: () => void }) {
  const { schoolId, yearId, classId } = useClassroom();
  const cmd = useCommand((ctx, i:StatusIntent) => i.fromDraft?activitiesRepo.assign(ctx,schoolId,yearId,classId,i.activity):activitiesRepo.setActivityStatus(ctx, schoolId, yearId, classId, i.id, i.to,{id:i.activity.id,version:i.activity.version,dataVersion:i.activity.dataVersion!,publicationId:i.activity.publicationId!}), {
    success: (a) => (a.status === "closed" ? "Đã kết thúc hoạt động" : intent?.fromDraft ? "Đã giao hoạt động" : "Đã mở lại hoạt động"),
  });
  const i = intent;
  return (
    <ConfirmDialog open={!!i} onOpenChange={(o) => { if (!o) onClose(); }} busy={cmd.pending} error={cmd.error?.message}
      title={!i ? "" : i.to === "closed" ? "Kết thúc hoạt động" : i.fromDraft ? "Giao hoạt động" : "Mở lại hoạt động"}
      object={i ? <>{i.title}{i.dueDate ? <span className="block text-[12.5px] font-normal text-muted">Hạn {fmtDate(i.dueDate)}{i.assigned !== undefined ? ` · ${i.assigned} học sinh được giao` : ""}</span> : null}</> : null}
      consequence={!i ? "" : i.to === "closed"
        ? "Hoạt động chuyển sang “Đã kết thúc”. Tiến độ và minh chứng được giữ nguyên; có thể mở lại khi cần."
        : i.fromDraft
          ? "Hoạt động được giao cho học sinh đã chọn. Công bố riêng để gia đình thấy qua link tra cứu. Hoàn thành hoạt động không tự cộng điểm thi đua."
          : "Hoạt động trở lại “Đang diễn ra”. Bản gia đình đang xem được giữ cho đến khi công bố lại."}
      confirmLabel={!i ? "" : i.to === "closed" ? "Kết thúc" : i.fromDraft ? "Giao hoạt động" : "Mở lại"}
      variant={i?.to === "closed" ? "danger" : "primary"}
      onConfirm={async () => { if (!i) return; const r = await cmd.run(i); if (r) onClose(); }} />
  );
}
