"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FilePen, Info, Search, Send, CheckCircle2, XCircle } from "lucide-react";
import type { AdjustmentRequest } from "@/lib/model/types";
import { conductRepo, RepoError, type Ctx } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, fmtPoints, matches } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { ErrorSummary, InlineSelect, NumberField, RadioGroup, SelectField, TextArea, TextField } from "@/components/ui/form";
import { useUnsavedChanges } from "@/components/ui/guards";
import { EmptyFiltered, EmptyState, QueryState, Skeleton } from "@/components/ui/states";
import { Pagination } from "@/components/data/table";
import { ADJ_KIND, ADJ_STATUS, ConductNav, Points } from "./shared";

type AdjData = Awaited<ReturnType<typeof conductRepo.adjustments>>;
type AdjItem = AdjData["items"][number];

/** CL11 — adjustments after lock: list, request (O21), approve / reject, re-publish (ST18). */
export function AdjustmentsScreen() {
  const { schoolId, yearId, classId, base } = useClassroom();
  const q = useRepo(["conduct-adjustments", classId], (ctx) => conductRepo.adjustments(ctx, schoolId, yearId, classId));
  const [form, setForm] = useState(false);
  return (
    <div className="page">
      <ClassHeader title="Điều chỉnh sau chốt" subtitle="Đề nghị, duyệt và công bố lại kết quả đã công bố — bản cũ được giữ nguyên"
        crumbs={[{ label: "Thi đua", href: `${base}/conduct` }, { label: "Điều chỉnh sau chốt" }]}
        actions={q.data?.canRequest ? <Button variant="primary" icon={<FilePen className="size-4" />} onClick={() => setForm(true)} data-testid="btn-new-adjustment">Đề nghị điều chỉnh</Button> : undefined} />
      <ConductNav />
      <Callout tone="info" icon={<Info />} title="Phụ huynh vẫn xem bản đã công bố trước đó">
        Trong lúc đề nghị chờ duyệt hoặc đã duyệt nhưng chưa công bố lại, phụ huynh vẫn thấy phiên bản đang công bố. Chỉ khi “Công bố lại”, bản mới thay thế và bản cũ chuyển sang “Đã thay bằng bản mới” (vẫn lưu lịch sử).
      </Callout>
      <QueryState query={q} skeleton="table">{(d) => <AdjList d={d} />}</QueryState>
      {form && <AdjustmentDialog open onOpenChange={setForm} />}
    </div>
  );
}

function AdjList({ d }: { d: AdjData }) {
  const { schoolId, yearId, classId, base } = useClassroom();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [decide, setDecide] = useState<{ a: AdjItem; approve: boolean } | null>(null);
  const [pub, setPub] = useState<AdjItem | null>(null);
  const [decideErr, setDecideErr] = useState<string>();
  const decideCmd = useCommand((ctx: Ctx, id: string, approve: boolean, note: string) => {const displayed=d.items.find(a=>a.id===id);if(!displayed)throw new RepoError('CONFLICT','Hãy tải lại đề nghị điều chỉnh.');return conductRepo.decideAdjustment(ctx, schoolId, yearId, classId, id, approve, note,displayed);}, {
    success: (a) => a.status === "approved" ? "Đã duyệt đề nghị — chờ công bố lại" : "Đã từ chối đề nghị", silentError: true,
    onError: (e) => setDecideErr(e.code === "FORBIDDEN" ? `Không thể duyệt: ${e.message}` : e.fieldErrors?.note ?? e.message), onSuccess: () => setDecide(null),
  });
  const pubCmd = useCommand((ctx: Ctx, id: string) => {const displayed=d.items.find(a=>a.id===id);if(!displayed)throw new RepoError('CONFLICT','Hãy tải lại đề nghị điều chỉnh.');return conductRepo.publishAdjustment(ctx, schoolId, yearId, classId, id,displayed);}, { success: (s) => `Đã công bố lại — bản ${s.versionNo}`, onSuccess: () => setPub(null) });
  const counts = d.items.reduce<Record<string, number>>((m, a) => { m[a.status] = (m[a.status] ?? 0) + 1; return m; }, {});
  const filtered = d.items.filter((a) => (!status || a.status === status) && matches(search, a.studentName, a.reason, a.requestedByName, a.recordLabel));
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  return (
    <Card>
      <CardHeader title="Đề nghị điều chỉnh" subtitle={`${d.items.length} đề nghị`} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <div className="input-icon min-w-[200px] flex-[2_1_240px]"><Search className="size-4" aria-hidden /><input className="input" type="search" placeholder="Tìm học sinh, lý do, người đề nghị…" aria-label="Tìm đề nghị" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <InlineSelect label="Lọc trạng thái" className="flex-[1_1_220px]" value={status} onChange={(v) => { setStatus(v); setPage(1); }} allLabel="Tất cả trạng thái"
          options={Object.entries(ADJ_STATUS).map(([value, v]) => ({ value, label: `${v.label} (${counts[value] ?? 0})` }))} />
      </div>
      {filtered.length === 0 ? (d.items.length === 0 ? <EmptyState compact title="Chưa có đề nghị điều chỉnh" description="Khi phát hiện sai sót ở bản đã công bố, tạo đề nghị kèm lý do để người có thẩm quyền duyệt." /> : <EmptyFiltered onReset={() => { setStatus(""); setSearch(""); }} what="đề nghị" />) : (
        <ul className="divide-y divide-line border-t border-line" data-testid="adj-list">
          {filtered.slice((cur - 1) * pageSize, cur * pageSize).map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-[1_1_320px] text-[13.5px]">
                <p className="flex flex-wrap items-center gap-2"><b className="text-ink">{a.studentName}</b><Badge tone={ADJ_STATUS[a.status]?.tone}>{ADJ_STATUS[a.status]?.label}</Badge>
                  <Link className="text-[12.5px] font-semibold text-primary-strong hover:underline" href={`${base}/publications/${a.snapshotId}`}>Tuần {a.weekIndex} · bản {a.snapshotVersion}</Link></p>
                <p className="mt-0.5 text-body">{(a.kind==='batch'?'Điều chỉnh nhiều ghi nhận':ADJ_KIND[a.kind])}{a.recordLabel ? `: ${a.recordLabel.replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1")}` : ""}{a.kind === "change_points" && a.newPoints !== undefined ? ` → ${fmtPoints(a.newPoints)}` : ""}</p>
                <p className="mt-0.5 text-body">Lý do: “{a.reason}”</p>
                <p className="mt-0.5 text-[12.5px] text-muted">Đề nghị bởi {a.requestedByName} lúc {fmtDateTime(a.requestedAt)}{a.decidedAt ? ` · ${a.status === "rejected" ? "Từ chối" : "Duyệt"} bởi ${a.decidedByName} lúc ${fmtDateTime(a.decidedAt)}` : ""}</p>
                {a.decisionNote && <p className="text-[12.5px] text-muted">Ghi chú xử lý: {a.decisionNote}</p>}
                {a.resultSnapshotId && <p className="text-[12.5px]"><Link className="font-semibold text-primary-strong hover:underline" href={`${base}/publications/${a.resultSnapshotId}`}>Xem bản mới</Link></p>}
              </div>
              <div className="flex flex-none items-center gap-2 rounded-xl bg-[#f7fbff] px-4 py-2 text-lg font-bold tabular-nums text-ink" aria-label={`Trước ${a.beforeTotal}, sau ${a.afterTotal}`}>
                {a.beforeTotal}<ArrowRight className="size-4 text-muted" aria-hidden /><span className="text-primary-strong">{a.afterTotal}</span>
              </div>
              <div className="flex flex-none flex-wrap gap-2">
                {a.status === "pending" && d.canApprove && <>
                  <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => { setDecideErr(undefined); setDecide({ a, approve: true }); }} data-testid="adj-approve">Duyệt</Button>
                  <Button size="sm" variant="danger-soft" icon={<XCircle className="size-4" />} onClick={() => { setDecideErr(undefined); setDecide({ a, approve: false }); }}>Từ chối</Button>
                </>}
                {a.status === "pending" && !d.canApprove && <span className="text-[12.5px] text-muted">Chờ Ban giám hiệu / người được giao quyền duyệt</span>}
                {a.status === "approved" && d.canPublish && <Button size="sm" variant="primary" icon={<Send className="size-4" />} onClick={() => setPub(a)} data-testid="adj-publish">Công bố lại</Button>}
                {a.status === "approved" && !d.canPublish && <span className="text-[12.5px] text-muted">Chờ người có quyền công bố lại</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} what="đề nghị" />
      <ConfirmDialog open={!!decide} onOpenChange={(o) => { if (!o) setDecide(null); }} title={decide?.approve ? "Duyệt điều chỉnh" : "Từ chối điều chỉnh"} variant={decide?.approve ? "primary" : "danger"}
        confirmLabel={decide?.approve ? "Duyệt và tạo bản mới" : "Từ chối"} busy={decideCmd.pending} error={decideErr}
        object={decide ? `${decide.a.studentName} — tuần ${decide.a.weekIndex}: ${decide.a.beforeTotal} → ${decide.a.afterTotal}` : undefined}
        consequence={decide?.approve ? "Đề nghị chuyển sang đã duyệt và chờ công bố lại. Phụ huynh vẫn xem bản đang công bố cho tới khi “Công bố lại”." : "Đề nghị kết thúc; bản đang công bố giữ nguyên."}
        reasonLabel={decide?.approve ? "Ghi chú (không bắt buộc)" : "Lý do từ chối"} reasonRequired={!decide?.approve}
        onConfirm={(note) => decide ? decideCmd.run(decide.a.id, decide.approve, note) : undefined} />
      <ConfirmDialog open={!!pub} onOpenChange={(o) => { if (!o) setPub(null); }} title="Công bố lại sau điều chỉnh" confirmLabel="Công bố lại" busy={pubCmd.pending} error={pubCmd.error?.message}
        object={pub ? `${pub.studentName} — tuần ${pub.weekIndex}: ${pub.beforeTotal} → ${pub.afterTotal}` : undefined}
        consequence="Bản mới thay bản đang công bố. Bản cũ chuyển “Đã thay bằng bản mới” và vẫn lưu lịch sử. Gia đình có đường dẫn còn hiệu lực sẽ thấy kết quả đã điều chỉnh của con mình kèm ghi chú điều chỉnh."
        onConfirm={() => pub ? pubCmd.run(pub.id) : undefined} />
    </Card>
  );
}

/** O21 — request an adjustment on a published snapshot. After total is computed with the snapshot's own rule version. */
export function AdjustmentDialog({ open, onOpenChange, snapshotId }: { open: boolean; onOpenChange: (o: boolean) => void; snapshotId?: string }) {
  const { schoolId, yearId, classId } = useClassroom();
  const list = useRepo(["conduct-adjustments", classId], (ctx) => conductRepo.adjustments(ctx, schoolId, yearId, classId));
  const [f, setF] = useState<{ snapshotId: string; studentId: string; kind: AdjustmentRequest["kind"]; recordId: string; newPoints?: number; ruleId: string; date: string; reason: string }>({ snapshotId: snapshotId ?? "", studentId: "", kind: "remove_record", recordId: "", ruleId: "", date: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [askDiscard, setAskDiscard] = useState(false);
  const snapQ = useRepo(["conduct-snapshot", classId, f.snapshotId], (ctx) => conductRepo.snapshot(ctx, schoolId, yearId, classId, f.snapshotId), { enabled: !!f.snapshotId });
  const dirty = !!(f.studentId || f.reason || (!snapshotId && f.snapshotId));
  useUnsavedChanges(dirty);
  const cmd = useCommand((ctx: Ctx, input: Parameters<typeof conductRepo.requestAdjustment>[4]) => conductRepo.requestAdjustment(ctx, schoolId, yearId, classId, input), {
    success: (a) => `Đã gửi đề nghị điều chỉnh (${a.beforeTotal} → ${a.afterTotal}) — chờ duyệt`,
    onError: (e) => setErrors(e.fieldErrors ?? { form: e.message }), silentError: false, onSuccess: () => onOpenChange(false),
  });
  const snaps = list.data?.snapshots ?? [];
  const snap = snaps.find((s) => s.id === f.snapshotId);
  const row = snap?.rows.find((r) => r.studentId === f.studentId);
  const rs = snapQ.data?.ruleSet;
  const item = row?.items.find((i) => i.recordId === f.recordId);
  const after = (() => {
    if (!row || !rs) return undefined;
    let delta: number | undefined;
    if (f.kind === "remove_record") delta = item ? -item.points : undefined;
    else if (f.kind === "change_points") delta = item && f.newPoints !== undefined ? f.newPoints - item.points : undefined;
    else { const rule=rs.rules.find((r)=>r.id===f.ruleId); delta=rule?.valueMode==='MANUAL'?f.newPoints:rule?.points; }
    if (delta === undefined) return undefined;
    const points = [...row.items.map((i) => i.points), delta];
    return conductRepo.simulate(rs, points);
  })();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined, form: undefined })); };
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.snapshotId) e.snapshotId = "Chọn bản đã công bố";
    if (!f.studentId) e.studentId = "Chọn học sinh";
    if (f.kind !== "add_record" && !f.recordId) e.recordId = "Chọn ghi nhận";
    if (f.kind === "change_points" && f.newPoints === undefined) e.newPoints = "Nhập số điểm mới";
    if (f.kind === "add_record" && !f.ruleId) e.ruleId = "Chọn quy định";
    if (f.kind === "add_record" && !f.date) e.date = "Chọn ngày sự việc trong tuần của bản công bố";
    if (f.kind === "add_record" && rs?.rules.find(r=>r.id===f.ruleId)?.valueMode==='MANUAL' && f.newPoints===undefined) e.newPoints="Nhập điểm trong giới hạn nội quy";
    if (f.reason.trim().length < 10) e.reason = "Nêu rõ lý do (tối thiểu 10 ký tự)";
    setErrors(e);
    if (Object.keys(e).length) return;
    if(!snapQ.data?.source){setErrors({form:'Tải bản đã công bố trước khi gửi đề nghị.'});return;}
    cmd.run({source:snapQ.data.source, snapshotId: f.snapshotId, studentId: f.studentId, kind: f.kind, recordId: f.kind === "add_record" ? undefined : f.recordId, newPoints: f.kind === "change_points" || f.kind === "add_record" ? f.newPoints : undefined, date: f.kind==='add_record'?f.date:undefined, ruleId: f.kind === "add_record" ? f.ruleId : undefined, reason: f.reason });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} busy={cmd.pending} size="lg" title="Đề nghị điều chỉnh sau chốt"
      description="Bản đang công bố được giữ nguyên cho tới khi bản điều chỉnh được duyệt và công bố lại."
      beforeClose={() => { if (dirty && !cmd.pending) { setAskDiscard(true); return false; } return true; }}
      footer={<>
        <Button variant="ghost" disabled={cmd.pending} onClick={() => (dirty ? setAskDiscard(true) : onOpenChange(false))}>Hủy</Button>
        <Button variant="primary" loading={cmd.pending} onClick={submit} data-testid="adj-submit">Gửi đề nghị</Button>
      </>}>
      {list.isLoading ? <Skeleton className="h-48" /> : (
        <div className="space-y-4">
          {askDiscard && <Callout tone="warning" title="Bỏ đề nghị đang soạn?" action={<div className="flex flex-col gap-1.5 sm:flex-row"><Button size="sm" variant="ghost" onClick={() => setAskDiscard(false)}>Tiếp tục soạn</Button><Button size="sm" variant="danger-soft" onClick={() => onOpenChange(false)}>Bỏ nội dung</Button></div>}>Đề nghị chưa được gửi.</Callout>}
          <ErrorSummary errors={errors} labels={{ snapshotId: "Bản công bố", studentId: "Học sinh", recordId: "Ghi nhận", newPoints: "Điểm mới", ruleId: "Quy định", reason: "Lý do", form: "Gửi" }} />
          {snaps.length === 0 && <Callout tone="neutral">Chưa có bản đang công bố để điều chỉnh.</Callout>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="snapshotId"><SelectField label="Bản đang công bố" required value={f.snapshotId} error={errors.snapshotId} placeholder="Chọn tuần"
              onChange={(e) => { setF((x) => ({ ...x, snapshotId: e.target.value, studentId: "", recordId: "", ruleId: "" })); setErrors({}); }}
              options={snaps.slice().sort((a, b) => b.weekIndex - a.weekIndex).map((s) => ({ value: s.id, label: `Tuần ${s.weekIndex} — bản ${s.versionNo}` }))} /></div>
            <div data-field="studentId"><Combobox label="Học sinh" required value={f.studentId} error={errors.studentId} placeholder={snap ? "Chọn học sinh" : "Chọn bản trước"} disabled={!snap}
              onChange={(v) => { setF((x) => ({ ...x, studentId: v as string, recordId: "" })); setErrors((e) => ({ ...e, studentId: undefined })); }}
              options={(snap?.rows ?? []).map((r) => ({ value: r.studentId, label: r.studentName, hint: `Tổng ${r.total}` }))} /></div>
          </div>
          <RadioGroup label="Loại điều chỉnh" direction="row" value={f.kind} onChange={(v) => { set("kind", v); set("recordId", ""); }}
            options={[{ value: "remove_record", label: "Bỏ một ghi nhận" }, { value: "change_points", label: "Đổi điểm" }, { value: "add_record", label: "Bổ sung ghi nhận" }]} />
          {row && f.kind !== "add_record" && (
            <div data-field="recordId">
              {row.items.length === 0 ? <p className="text-sm text-muted">Học sinh không có ghi nhận nào trong bản này.</p> : (
                <SelectField label="Ghi nhận trong bản công bố" required value={f.recordId} error={errors.recordId} placeholder="Chọn ghi nhận" onChange={(e) => set("recordId", e.target.value)}
                  options={row.items.map((i) => ({ value: i.recordId, label: `${fmtDate(i.date)} — ${i.label} (${fmtPoints(i.points)})` }))} />
              )}
            </div>
          )}
          {f.kind === "change_points" && <div data-field="newPoints"><NumberField label="Số điểm mới (dương là cộng, âm là trừ)" required value={f.newPoints} onChange={(v) => set("newPoints", v)} error={errors.newPoints} min={-100} max={100} /></div>}
          {f.kind === "add_record" && row && rs && (
            <div data-field="ruleId"><SelectField label={`Quy định (theo nội quy bản ${rs.versionNo} của bản công bố)`} required value={f.ruleId} error={errors.ruleId} placeholder="Chọn quy định" onChange={(e) => set("ruleId", e.target.value)}
              options={rs.rules.filter(r=>!r.attendanceLink).map((r) => ({ value: r.id, label: `${r.category} — ${r.label} (${fmtPoints(r.points)})` }))} /></div>
          )}
          {f.kind === "add_record" && <div data-field="date"><TextField label="Ngày sự việc" type="date" required value={f.date} onChange={e=>set("date",e.target.value)} error={errors.date} min={snapQ.data?.week.startDate} max={snapQ.data?.week.endDate} /></div>}
          {f.kind === "add_record" && rs?.rules.find(r=>r.id===f.ruleId)?.valueMode==='MANUAL' && <div data-field="newPoints"><NumberField label="Điểm bổ sung (trong giới hạn nội quy)" required value={f.newPoints} onChange={v=>set("newPoints",v)} error={errors.newPoints} min={rs.rules.find(r=>r.id===f.ruleId)?.minimumDelta??undefined} max={rs.rules.find(r=>r.id===f.ruleId)?.maximumDelta??undefined} /></div>}
          <div data-field="reason"><TextArea label="Lý do điều chỉnh" required rows={3} maxChars={400} value={f.reason} onChange={(e) => set("reason", e.target.value)} error={errors.reason} helper="Tối thiểu 10 ký tự; lưu kèm bản mới và hiển thị trong lịch sử." placeholder="Ví dụ: Ghi nhận đi muộn nhầm học sinh, em đến đúng giờ" /></div>
          {row && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-[#f7fbff] px-4 py-3 text-sm" data-testid="adj-preview">
              <span className="text-muted">Tổng điểm</span>
              <b className="text-lg tabular-nums text-ink">{row.total}</b><ArrowRight className="size-4 text-muted" aria-hidden />
              <b className="text-lg tabular-nums text-primary-strong">{after ? after.total : "—"}</b>
              {after && <span className="text-muted">({after.grade}{after.raw !== after.total ? `, tổng thô ${after.raw} đã giới hạn` : ""})</span>}
              {rs && after && <span className="basis-full text-[12.5px] text-muted">{rs.baseScore}{[...row.items.filter((i) => !(f.kind !== "add_record" && i.recordId === f.recordId)).map((i) => i.points), ...(f.kind === "remove_record" ? [] : f.kind === "change_points" ? [f.newPoints ?? 0] : [rs.rules.find((r) => r.id === f.ruleId)?.points ?? 0])].map((p) => ` ${p < 0 ? "−" : "+"} ${Math.abs(p)}`).join("")} = {after.raw} · theo {rs.name} (bản {rs.versionNo})</span>}
            </div>
          )}
          {f.kind === "remove_record" && item && <p className="text-[12.5px] text-muted">Bỏ: {item.label} <Points value={item.points} /></p>}
        </div>
      )}
    </Modal>
  );
}
