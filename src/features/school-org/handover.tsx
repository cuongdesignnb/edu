"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, CheckCircle2, RefreshCw, History, Info, ClipboardList } from "lucide-react";
import { schoolRepo, staffRepo } from "@/lib/repositories";
import { schoolOrgRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { useSchool, SchoolYearBar } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { DateField, TextArea } from "@/components/ui/form";
import { Stepper } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Timeline } from "@/components/ui/timeline";
import { DeniedState, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useUnsavedChanges } from "@/components/ui/guards";
import { addDays } from "@/lib/calendar";
import { fmtDate } from "@/lib/formatters";
import { FormError, useFormErrors } from "./common";

const STEPS = ["Chọn lớp", "GVCN hiện tại", "Người nhận", "Ngày hiệu lực", "Xác nhận"];
const OPEN_LABELS: Record<string, string> = {
  pendingConduct: "Ghi nhận thi đua chờ rà soát", openWeeks: "Tuần thi đua chưa chốt", pendingAdjustments: "Đề nghị điều chỉnh chờ duyệt",
  pendingEvidence: "Minh chứng chờ duyệt", draftAnnouncements: "Thông báo lớp đang nháp", activeLinks: "Link tra cứu đang hiệu lực",
};

/** SC15 — homeroom handover: class → current → new teacher → effective date → open items → confirm. History authorship is kept. */
export function HandoverWizard() {
  const { school, yearId, can } = useSchool();
  const ctx = useCtx();
  const sp = useSearchParams();
  const preset = sp.get("class") ?? "";
  const classes = useRepo(["school-handover-classes", school.id, yearId], (c) => schoolOrgRepo.handoverClasses(c, school.id, yearId), { enabled: can("assignment.manage") });
  const opts = useRepo(["school-form-options", school.id], (c) => schoolRepo.formOptions(c, school.id), { enabled: can("assignment.manage") });
  const [step, setStep] = useState(preset ? 1 : 0);
  const [classId, setClassId] = useState(preset);
  const [to, setTo] = useState("");
  const [date, setDate] = useState<string | undefined>(addDays(ctx.today, 1));
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<{ className: string; from: string; to: string; date: string } | null>(null);
  const { errors, setErrors, onError } = useFormErrors();
  const preview = useRepo(["school-handover-preview", school.id, classId], (c) => staffRepo.handoverPreview(c, school.id, classId), { enabled: !!classId && can("assignment.manage") });
  useUnsavedChanges(!done && (!!to || note.length > 0));
  const cmd = useCommand((c, input: Parameters<typeof staffRepo.handover>[2]) => staffRepo.handover(c, school.id, input), {
    success: "Đã bàn giao chủ nhiệm", onError: (e) => { onError(e); setConfirm(false); const k = Object.keys(e.fieldErrors ?? {}); if (k.includes("toMembershipId")) setStep(2); else if (k.includes("effectiveDate")) setStep(3); else if (k.includes("classId")) setStep(0); },
  });
  const b = `/school/${school.id}`;
  if (!can("assignment.manage")) return <div className="page"><PageHeader title="Bàn giao giáo viên chủ nhiệm" /><div className="card"><DeniedState message="Bàn giao chủ nhiệm cần quyền phân công." /></div></div>;

  const cls = classes.data?.find((c) => c.id === classId);
  const cur = preview.data?.current;
  const newT = opts.data?.teachers?.find((t) => t.membershipId === to);
  const openTotal = preview.data ? Object.values(preview.data.openItems).reduce((a, n) => a + n, 0) : 0;
  const reset = () => { setDone(null); setStep(0); setClassId(""); setTo(""); setNote(""); setDate(addDays(ctx.today, 1)); setErrors({}); };
  const next = () => {
    const e: Record<string, string> = {};
    if (step === 0 && !classId) e.classId = "Chọn lớp cần bàn giao";
    if (step === 1 && !cur) e.classId = "Lớp chưa có GVCN — dùng Phân công thay vì Bàn giao";
    if (step === 2 && !to) e.toMembershipId = "Chọn giáo viên nhận";
    if (step === 3 && !date) e.effectiveDate = "Chọn ngày hiệu lực";
    if (step === 3 && date && date < ctx.today) e.effectiveDate = "Không áp dụng ngược về quá khứ";
    if (step === 3 && note.trim().length < 3) e.note = "Ghi lý do / nội dung bàn giao";
    setErrors(e);
    if (!Object.keys(e).length) setStep((s) => s + 1);
  };

  return (
    <div className="page">
      <PageHeader title="Bàn giao giáo viên chủ nhiệm" subtitle="Chuyển quyền chủ nhiệm theo ngày hiệu lực; lịch sử và tác giả các ghi nhận cũ được giữ nguyên"
        breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Giáo viên", href: `${b}/teachers` }, { label: "Bàn giao chủ nhiệm" }]}>
        <SchoolYearBar />
      </PageHeader>
      {done ? (
        <Card className="p-6"><div className="flex items-start gap-4"><span className="icon-tile tone-green" aria-hidden><CheckCircle2 className="size-7" /></span>
          <div className="space-y-2"><p className="text-[18px] font-bold text-ink">Đã bàn giao chủ nhiệm lớp {done.className}</p>
            <p className="text-sm text-body">Từ {fmtDate(done.date)}, {done.to} là GVCN. {done.from} mất quyền chủ nhiệm lớp này từ ngày đó; các ghi nhận do {done.from} tạo vẫn ghi đúng tên người tạo. Hai giáo viên đã nhận thông báo trong hệ thống.</p>
            <div className="flex flex-wrap gap-2 pt-1"><ButtonLink href={`${b}/assignments`} variant="primary">Xem ma trận phân công</ButtonLink><Button onClick={reset} icon={<RefreshCw className="size-4" />}>Bàn giao lớp khác</Button></div>
          </div></div></Card>
      ) : (
        <>
          <Card className="px-5 py-4"><Stepper steps={STEPS} current={step} onStep={setStep} /></Card>
          <Card>
            <CardHeader title={STEPS[step]} />
            <div className="space-y-4 px-5 pb-5">
              <FormError message={errors._form} />
              {step === 0 && (classes.isLoading ? <Skeleton className="h-40" /> : classes.error ? <ErrorState error={classes.error} onRetry={() => classes.refetch()} compact /> : !classes.data?.length ? <EmptyState compact title="Năm học chưa có lớp" /> : (
                <div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="radiogroup" aria-label="Chọn lớp">
                    {classes.data.map((c) => (
                      <button key={c.id} type="button" role="radio" aria-checked={classId === c.id} disabled={!c.homeroomName} onClick={() => { setClassId(c.id); setTo(""); setErrors({}); }}
                        className={clsx("rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55", classId === c.id ? "border-[#9cc7f5] bg-primary-light" : "border-line bg-white hover:bg-[#f8fbff]")}>
                        <span className="block font-bold text-ink">{c.name}</span>
                        <span className="block truncate text-[12px] text-muted">{c.homeroomName ?? "Chưa có GVCN"}</span>
                      </button>
                    ))}
                  </div>
                  {errors.classId && <p className="error-text mt-2">{errors.classId}</p>}
                  <p className="mt-2 text-[12.5px] text-muted">Lớp chưa có GVCN không bàn giao được — dùng Phân công ở Ma trận phân công.</p>
                </div>
              ))}
              {step === 1 && (preview.isLoading ? <Skeleton className="h-40" /> : preview.error ? <ErrorState error={preview.error} onRetry={() => preview.refetch()} compact /> : preview.data && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <dl className="rounded-xl border border-line p-4">
                    <InfoRow label="Lớp">{preview.data.className}</InfoRow>
                    <InfoRow label="GVCN hiện tại">{cur?.name ?? <span className="text-danger-text">Chưa có</span>}</InfoRow>
                  </dl>
                  <div className="rounded-xl border border-line p-4">
                    <p className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink"><ClipboardList className="size-4 text-primary" aria-hidden />Việc còn mở của lớp ({openTotal})</p>
                    <ul className="space-y-1 text-[13px]">{Object.entries(preview.data.openItems).map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span className="text-body">{OPEN_LABELS[k] ?? k}</span><span className={clsx("font-semibold tabular-nums", n ? "text-warning-text" : "text-muted")}>{n}</span></li>)}</ul>
                    <p className="mt-2 text-[12px] text-muted">Việc còn mở chuyển sang GVCN mới xử lý từ ngày hiệu lực; nên thống nhất trước khi bàn giao.</p>
                  </div>
                  {errors.classId && <p className="error-text lg:col-span-2">{errors.classId}</p>}
                </div>
              ))}
              {step === 2 && (
                <div className="max-w-md">
                  <Combobox label="Giáo viên nhận chủ nhiệm" required placeholder="Chọn giáo viên" value={to} onChange={(v) => { setTo(v as string); setErrors({}); }} error={errors.toMembershipId}
                    options={(opts.data?.teachers ?? []).filter((t) => t.membershipId !== cur?.membershipId).map((t) => ({ value: t.membershipId, label: t.name, hint: t.department }))}
                    helper="Giáo viên đang chủ nhiệm lớp khác trong cùng năm sẽ bị từ chối." />
                </div>
              )}
              {step === 3 && (
                <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                  <DateField label="Ngày hiệu lực" required value={date} min={ctx.today} onChange={setDate} error={errors.effectiveDate} helper={`${cur?.name ?? "GVCN cũ"} giữ quyền đến hết ngày trước đó`} />
                  <TextArea label="Lý do / nội dung bàn giao" required rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} className="sm:col-span-2" maxChars={300} />
                </div>
              )}
              {step === 4 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <dl className="rounded-xl border border-line p-4">
                    <InfoRow label="Lớp">{cls?.name ?? preview.data?.className}</InfoRow>
                    <InfoRow label="GVCN hiện tại">{cur?.name}</InfoRow>
                    <InfoRow label="GVCN mới">{newT?.name}</InfoRow>
                    <InfoRow label="Hiệu lực từ">{fmtDate(date)}</InfoRow>
                    <InfoRow label="Nội dung">{note}</InfoRow>
                    <InfoRow label="Việc còn mở">{openTotal}</InfoRow>
                  </dl>
                  <Callout tone="info" icon={<Info />} title="Sau khi xác nhận">
                    <ul className="list-disc space-y-1 pl-4">
                      <li>{cur?.name} mất các quyền chủ nhiệm lớp này từ {fmtDate(date)} (quyền bộ môn nếu có vẫn giữ).</li>
                      <li>{newT?.name} nhận quyền chủ nhiệm từ {fmtDate(date)}; lớp xuất hiện trong “Lớp học của tôi”.</li>
                      <li>Điểm danh, thi đua, hoạt động đã ghi giữ nguyên tác giả và lịch sử.</li>
                    </ul>
                  </Callout>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
                {step > 0 ? <Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep((s) => s - 1)}>Quay lại</Button> : <ButtonLink href={`${b}/teachers`} variant="ghost">Hủy</ButtonLink>}
                {step < 4 ? <Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={next} disabled={step === 1 && preview.isLoading}>Tiếp tục</Button>
                  : <Button variant="primary" onClick={() => setConfirm(true)}>Xác nhận bàn giao</Button>}
              </div>
            </div>
          </Card>
        </>
      )}
      <HandoverHistory />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} busy={cmd.pending} title="Xác nhận bàn giao chủ nhiệm" confirmLabel="Bàn giao"
        object={`Lớp ${cls?.name ?? preview.data?.className}: ${cur?.name} → ${newT?.name}`} consequence={`Hiệu lực từ ${fmtDate(date)}. Không thể hoàn tác tự động; muốn đổi lại cần một lần bàn giao mới.`}
        onConfirm={async () => { const r = await cmd.run({ classId, toMembershipId: to, effectiveDate: date!, note: note.trim() }); if (r) { setConfirm(false); setDone({ className: cls?.name ?? preview.data?.className ?? "", from: cur?.name ?? "", to: newT?.name ?? "", date: date! }); } }} />
    </div>
  );
}

function HandoverHistory() {
  const { school } = useSchool();
  const q = useRepo(["school-staff-activity", school.id, "handover"], (c) => schoolOrgRepo.staffActivity(c, school.id, { limit: 10, action: "Bàn giao chủ nhiệm" }));
  return (
    <Card>
      <CardHeader title="Lịch sử bàn giao" icon={<History className="size-5 text-primary" />} action={q.data ? <Badge tone="neutral" dot={false}>{q.data.total} lần</Badge> : undefined} />
      <div className="px-6 pb-5">
        {q.isLoading ? <Skeleton className="h-16" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact /> : (
          <Timeline items={(q.data?.items ?? []).map((e) => ({ id: e.id, at: e.at, title: `Lớp ${e.entityLabel}: ${String(e.before?.homeroom ?? "—")} → ${String(e.after?.homeroom ?? "—")}`, detail: [e.after?.from ? `Hiệu lực từ ${fmtDate(String(e.after.from))}` : "", e.reason ? `Lý do: ${e.reason}` : ""].filter(Boolean).join(" · "), actor: e.actorName, tone: "amber" }))} empty="Chưa có lần bàn giao nào." />
        )}
      </div>
    </Card>
  );
}
