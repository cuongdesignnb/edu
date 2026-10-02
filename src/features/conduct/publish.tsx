"use client";
import { useState } from "react";
import { CheckCircle2, Info, Lock, Search, Send, Unlock, ShieldCheck, AlertTriangle, XCircle } from "lucide-react";
import { conductRepo, type Ctx } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { fmtDate } from "@/lib/formatters";
import { useClassroom } from "@/features/classroom/context";
import { Modal, ConfirmDialog } from "@/components/ui/dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, InfoRow } from "@/components/ui/card";
import { weekLabel } from "./shared";

export type WeekSummary = Awaited<ReturnType<typeof conductRepo.weekSummary>>;
export type PublishMode = "lock" | "lockPublish" | "publish";

const TITLES: Record<PublishMode, string> = { lock: "Chốt tuần (chưa công bố)", lockPublish: "Chốt và công bố cho phụ huynh", publish: "Công bố cho phụ huynh" };
const CONFIRM: Record<PublishMode, string> = { lock: "Chốt tuần", lockPublish: "Chốt và công bố", publish: "Công bố" };

/** O20 — lock / lock+publish / publish. Success only after the mutation committed; blocking issues stop lock. */
export function PublishDialog({ mode, onClose, s }: { mode: PublishMode | null; onClose: () => void; s: WeekSummary }) {
  const { schoolId, yearId, classId, header } = useClassroom();
  const lock = useCommand((ctx: Ctx, also: boolean) => conductRepo.lock(ctx, schoolId, yearId, classId, s.week.id, also,s.source), {
    success: (r) => (r.status === "published" ? `Đã chốt và công bố tuần ${s.week.index}` : `Đã chốt tuần ${s.week.index} — phụ huynh chưa thấy`), onSuccess: onClose,
  });
  const publish = useCommand((ctx: Ctx) => conductRepo.publish(ctx, schoolId, yearId, classId, s.week.id,s.source), { success: `Đã công bố tuần ${s.week.index} cho phụ huynh`, onSuccess: onClose });
  const busy = lock.pending || publish.pending;
  const blocking = mode === "publish" ? [] : s.checks.blocking;
  const n = (s.snapshot?.rows ?? s.rows).length;
  const err = lock.error?.message ?? publish.error?.message;
  return (
    <Modal open={!!mode} onOpenChange={(o) => { if (!o) { lock.reset(); publish.reset(); onClose(); } }} busy={busy} size="md" title={mode ? TITLES[mode] : ""}
      description="Kiểm tra đối tượng, phạm vi và người nhận trước khi xác nhận."
      footer={<>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button>
        {mode && <Button variant="primary" loading={busy} disabled={blocking.length > 0} data-testid="publish-confirm"
          icon={mode === "lock" ? <Lock className="size-4" /> : <Send className="size-4" />}
          onClick={() => (mode === "publish" ? publish.run() : lock.run(mode === "lockPublish"))}>{CONFIRM[mode]}</Button>}
      </>}>
      {mode && (
        <div className="space-y-3.5 text-sm">
          <div className="rounded-xl border border-line bg-[#f7fbff] px-3.5 py-2.5 font-semibold text-ink">Lớp {header.class.name} — {weekLabel(s.week)}</div>
          <dl>
            <InfoRow label="Số học sinh trong bảng">{n}</InfoRow>
            <InfoRow label="Nội quy áp dụng">{s.ruleSet.name} (bản {s.ruleSet.versionNo})</InfoRow>
            {s.snapshot && <InfoRow label="Bản đã chốt">Bản {s.snapshot.versionNo} · chốt {fmtDate(s.snapshot.lockedAt)}{s.period.lockedByName ? ` bởi ${s.period.lockedByName}` : ""}</InfoRow>}
          </dl>
          <div className="flex gap-2.5 text-body">
            <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" aria-hidden />
            <div className="space-y-1.5">
              {mode !== "publish" && <p><b>Chốt</b> tạo một bản chính thức không đổi (snapshot) từ các ghi nhận đã duyệt. Sau khi chốt, tuần này không ghi hoặc sửa trực tiếp; thay đổi phải qua đề nghị điều chỉnh.</p>}
              {mode === "lock" && <p>Phụ huynh <b>chưa thấy</b> kết quả cho tới khi có người đủ quyền công bố.</p>}
              {mode !== "lock" && <p><b>Người nhận:</b> các gia đình có đường dẫn riêng còn hiệu lực sẽ thấy <b>chỉ dòng của con mình</b> (tổng điểm, xếp loại, các ghi nhận được phép chia sẻ). Không ai thấy bảng cả lớp. Gia đình chưa được cấp link hoặc link đã thu hồi sẽ không thấy.</p>}
            </div>
          </div>
          {blocking.length > 0 && (
            <div className="rounded-xl border border-[#f6c9cb] bg-danger-bg px-3.5 py-2.5 text-danger-text" role="alert">
              <p className="font-semibold">Chưa thể chốt — còn lỗi chặn:</p>
              <ul className="mt-1 list-disc pl-5">{blocking.map((b) => <li key={b}>{b}</li>)}</ul>
              <p className="mt-1 text-[12.5px]">Xử lý ở màn hình Rà soát và chốt tuần.</p>
            </div>
          )}
          {mode !== "publish" && s.checks.warnings.length > 0 && (
            <div className="rounded-xl border border-[#f5d9a6] bg-warning-bg px-3.5 py-2.5 text-warning-text">
              <p className="font-semibold">Cảnh báo (không chặn):</p>
              <ul className="mt-1 list-disc pl-5">{s.checks.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {err && <p className="error-text" role="alert">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

/** “Mở lại” — only when locked and not yet published; reason required. */
export function ReopenButton({ s }: { s: WeekSummary }) {
  const { schoolId, yearId, classId, header } = useClassroom();
  const [open, setOpen] = useState(false);
  const cmd = useCommand((ctx: Ctx, reason: string) => conductRepo.reopen(ctx, schoolId, yearId, classId, s.week.id, reason,s.source), { success: `Đã mở lại tuần ${s.week.index}`, onSuccess: () => setOpen(false) });
  if (!(s.perms.lock && s.period.status === "locked")) return null;
  return (
    <>
      <Button variant="secondary" icon={<Unlock className="size-4" />} onClick={() => setOpen(true)}>Mở lại tuần</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Mở lại tuần đã chốt" object={`Lớp ${header.class.name} — ${weekLabel(s.week)}`}
        consequence="Bản đã chốt sẽ chuyển sang “Đã rút” (vẫn lưu lịch sử). Tuần trở lại trạng thái đang mở để rà soát tiếp. Chỉ làm được khi chưa công bố."
        confirmLabel="Mở lại" variant="danger" reasonLabel="Lý do mở lại (tối thiểu 5 ký tự)" reasonRequired busy={cmd.pending} error={cmd.error?.fieldErrors?.reason ?? cmd.error?.message}
        onConfirm={(reason) => cmd.run(reason)} />
    </>
  );
}

/** Buttons for Chốt / Chốt và công bố / Công bố according to permissions + state. */
export function LockPublishButtons({ s, onMode, vertical }: { s: WeekSummary; onMode: (m: PublishMode) => void; vertical?: boolean }) {
  const st = s.period.status;
  const noBlock = s.checks.blocking.length === 0;
  const cls = vertical ? "w-full justify-center" : undefined;
  return (
    <>
      {s.perms.lock && st === "open" && <Button className={cls} variant={s.perms.publish && noBlock ? "secondary" : "primary"} icon={<CheckCircle2 className="size-4" />} onClick={() => onMode("lock")} data-testid="btn-lock">Chốt tuần</Button>}
      {s.perms.lock && s.perms.publish && noBlock && st === "open" && <Button className={cls} variant="primary" icon={<ShieldCheck className="size-4" />} onClick={() => onMode("lockPublish")} data-testid="btn-lock-publish">Chốt và công bố</Button>}
      {s.perms.publish && st !== "published" && (
        <Button className={cls} variant={st === "locked" ? "primary" : "secondary"} icon={<Send className="size-4" />} disabled={st !== "locked"} onClick={() => onMode("publish")} data-testid="btn-publish"
          title={st !== "locked" ? "Cần chốt tuần trước khi công bố" : undefined}>Công bố cho phụ huynh</Button>
      )}
    </>
  );
}

/** “Thao tác” panel (R08 bottom-right) with corrected semantics. */
export function ActionsPanel({ s }: { s: WeekSummary }) {
  const { base } = useClassroom();
  const [mode, setMode] = useState<PublishMode | null>(null);
  const st = s.period.status;
  const nothing = !s.perms.review && !s.perms.lock && !s.perms.publish;
  return (
    <Card className="flex flex-col">
      <CardHeader title="Thao tác" />
      <div className="flex flex-1 flex-col gap-2.5 px-5 pb-5">
        {s.perms.review && (
          <ButtonLink href={`${base}/conduct/review?week=${s.week.id}`} variant="secondary" block icon={<Search className="size-4" />}>
            Rà soát{s.checks.pending > 0 && <Badge tone="warning" dot={false} className="ml-1">{s.checks.pending} chờ</Badge>}
          </ButtonLink>
        )}
        <LockPublishButtons s={s} onMode={setMode} vertical />
        {st === "locked" && s.perms.lock && !s.perms.publish && <p className="text-[12.5px] text-muted">Tuần đã chốt. Công bố do người được trường giao quyền công bố thực hiện.</p>}
        {st === "published" && <p className="flex items-center gap-2 text-[13px] font-semibold text-success-text"><CheckCircle2 className="size-4" aria-hidden />Tuần này đã công bố</p>}
        {nothing && <p className="text-[13px] text-muted">Bạn có thể ghi nhận cho học sinh. Rà soát, chốt và công bố do giáo viên chủ nhiệm hoặc người được nhà trường giao quyền thực hiện.</p>}
        {s.checks.blocking.length > 0 && st === "open" && (s.perms.lock || s.perms.review) && (
          <p className="flex items-start gap-1.5 text-[12.5px] text-danger-text"><XCircle className="mt-0.5 size-3.5 flex-none" aria-hidden />Chưa chốt được: {s.checks.blocking.join("; ")}.</p>
        )}
        <div className="mt-auto flex gap-2.5 rounded-xl border border-[#cfe3fb] bg-primary-light px-3.5 py-3 text-[12.5px] text-[#0b4c99]">
          <Info className="mt-0.5 size-4 flex-none" aria-hidden />
          <p>Ghi nhận được lưu ngay ở trạng thái “Chờ rà soát”. Chỉ dữ liệu đã <b>công bố</b> mới hiển thị cho phụ huynh qua đường dẫn riêng của từng gia đình.</p>
        </div>
      </div>
      <PublishDialog mode={mode} onClose={() => setMode(null)} s={s} />
    </Card>
  );
}
