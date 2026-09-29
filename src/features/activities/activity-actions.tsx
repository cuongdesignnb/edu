"use client";
import { activitiesRepo } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { fmtDate } from "@/lib/formatters";
import { useClassroom } from "@/features/classroom/context";
import { ConfirmDialog } from "@/components/ui/dialog";

export type StatusIntent = { id: string; title: string; to: "active" | "closed"; fromDraft?: boolean; dueDate?: string; assigned?: number };

/** Confirm close / reopen / publish-from-draft of an activity (setActivityStatus). */
export function ActivityStatusConfirm({ intent, onClose }: { intent: StatusIntent | null; onClose: () => void }) {
  const { schoolId, yearId, classId } = useClassroom();
  const cmd = useCommand((ctx, id: string, to: "active" | "closed") => activitiesRepo.setActivityStatus(ctx, schoolId, yearId, classId, id, to), {
    success: (a) => (a.status === "closed" ? "Đã kết thúc hoạt động" : intent?.fromDraft ? "Đã giao hoạt động" : "Đã mở lại hoạt động"),
  });
  const i = intent;
  return (
    <ConfirmDialog open={!!i} onOpenChange={(o) => { if (!o) onClose(); }} busy={cmd.pending}
      title={!i ? "" : i.to === "closed" ? "Kết thúc hoạt động" : i.fromDraft ? "Giao hoạt động" : "Mở lại hoạt động"}
      object={i ? <>{i.title}{i.dueDate ? <span className="block text-[12.5px] font-normal text-muted">Hạn {fmtDate(i.dueDate)}{i.assigned !== undefined ? ` · ${i.assigned} học sinh được giao` : ""}</span> : null}</> : null}
      consequence={!i ? "" : i.to === "closed"
        ? "Hoạt động chuyển sang “Đã kết thúc”. Tiến độ và minh chứng được giữ nguyên; có thể mở lại khi cần."
        : i.fromDraft
          ? "Hoạt động được giao và hiển thị cho gia đình của các học sinh được giao (qua link tra cứu). Hoàn thành hoạt động không tự cộng điểm thi đua."
          : "Hoạt động trở lại “Đang diễn ra” và hiển thị lại cho gia đình học sinh được giao."}
      confirmLabel={!i ? "" : i.to === "closed" ? "Kết thúc" : i.fromDraft ? "Giao hoạt động" : "Mở lại"}
      variant={i?.to === "closed" ? "danger" : "primary"}
      onConfirm={async () => { if (!i) return; const r = await cmd.run(i.id, i.to); if (r) onClose(); }} />
  );
}
