"use client";
import { History } from "lucide-react";
import { teacherExtraRepo } from "@/lib/repositories/teacher-extra";
import { useRepo } from "@/lib/query/hooks";
import { attendanceStatus, fmtDateLong, fmtDateTime, fmtPoints } from "@/lib/formatters";
import { Drawer } from "@/components/ui/dialog";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Timeline } from "@/components/ui/timeline";
import { QueryState } from "@/components/ui/states";

/** O15 view — one student's record on one session: status, note, change history (who / when / reason). */
export function RecordHistoryDrawer({ open, onOpenChange, schoolId, yearId, classId, target, dayHref }: {
  open: boolean; onOpenChange: (o: boolean) => void; schoolId: string; yearId: string; classId: string;
  target: { studentId: string; date: string; slot?: string } | null; dayHref?: string;
}) {
  const q = useRepo(["att-history", classId, target?.studentId, target?.date, target?.slot], (ctx) => teacherExtraRepo.recordHistory(ctx, schoolId, yearId, classId, target!.studentId, target!.date, target?.slot ?? "morning"), { enabled: open && !!target });
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={q.data ? `${q.data.studentName} · ${q.data.code}` : "Chi tiết điểm danh"} description={target ? fmtDateLong(target.date) : undefined} width={480}
      footer={<>{dayHref && <ButtonLink href={dayHref} variant="secondary">Mở bảng điểm danh ngày</ButtonLink>}<Button onClick={() => onOpenChange(false)}>Đóng</Button></>}>
      {open && target && (
        <QueryState query={q} skeleton="none" compactError>
          {(d) => (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={attendanceStatus[d.status].tone}>{attendanceStatus[d.status].label}</Badge>
                <Badge tone={PUBLICATION_STATUS[d.sessionStatus]?.tone ?? "neutral"}>{d.sessionStatus === "none" ? "Chưa điểm danh" : PUBLICATION_STATUS[d.sessionStatus]?.label}</Badge>
                {d.publishedAt && <span className="text-[12px] text-muted">Công bố {fmtDateTime(d.publishedAt)}</span>}
              </div>
              <div><p className="font-semibold text-ink">Ghi chú</p><p className="text-body">{d.note || "Không có ghi chú."}</p></div>
              {d.linkedConduct.length > 0 && (
                <div>
                  <p className="font-semibold text-ink">Ghi nhận thi đua liên kết</p>
                  <ul className="mt-1 space-y-1">{d.linkedConduct.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2"><b className="tabular-nums">{fmtPoints(c.points)}</b><span className="text-body">{c.reason}</span><Badge tone={PUBLICATION_STATUS[c.status]?.tone ?? "neutral"}>{PUBLICATION_STATUS[c.status]?.label ?? c.status}</Badge></li>)}</ul>
                </div>
              )}
              <div>
                <p className="mb-2 flex items-center gap-2 font-semibold text-ink"><History className="size-4" aria-hidden />Lịch sử thay đổi</p>
                <Timeline items={d.history.map((h) => ({ id: h.id, at: h.at, actor: h.byName, title: `${attendanceStatus[h.from].label} → ${attendanceStatus[h.to].label}`, detail: h.reason ? `Lý do: ${h.reason}` : undefined, tone: h.reason ? "amber" : "blue" }))} empty="Chưa có thay đổi nào được ghi." />
              </div>
            </div>
          )}
        </QueryState>
      )}
    </Drawer>
  );
}
