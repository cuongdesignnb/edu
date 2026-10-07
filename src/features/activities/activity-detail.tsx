"use client";
import { Suspense, useMemo, useState } from "react";
import { CheckCircle2, Edit3, Eye, FileImage, Info, Lock, PlayCircle, RotateCcw, Send, Upload, XCircle } from "lucide-react";
import type { SubmissionStatus } from "@/lib/model/types";
import { activitiesRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, fmtPercent, submissionStatus, matches } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { InlineSelect, SelectField, TextArea } from "@/components/ui/form";
import { Modal } from "@/components/ui/dialog";
import { Timeline } from "@/components/ui/timeline";
import { FileThumb } from "@/components/ui/file";
import { EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { BulkSelectionBar, DataTable, FilterBar, Pagination, type Column } from "@/components/data/table";
import { ActivityArt, activityState, daysBetween, scopeLabel } from "./shared";
import { ActivityStatusConfirm, type StatusIntent } from "./activity-actions";
import { EvidenceStatusBadge, FileViewerDialog, RecordEvidenceDialog, ReviewEvidenceDialog, type ReviewDecision } from "./evidence-dialogs";

type Detail = Awaited<ReturnType<typeof activitiesRepo.detail>>;
type Row = Detail["students"][number];
type Ev = Row["evidence"][number] & { studentName: string };

/** CL19 — activity detail: Thông tin / Tiến độ / Minh chứng / Lịch sử. */
export function ActivityDetailPage({ activityId }: { activityId: string }) {
  const { schoolId, yearId, classId, base } = useClassroom();
  const q = useRepo(["activity", schoolId, yearId, classId, activityId], (ctx) => activitiesRepo.detail(ctx, schoolId, yearId, classId, activityId));
  return (
    <div className="page">
      <ClassHeader title={q.data?.activity.title ?? "Chi tiết hoạt động"} crumbs={[{ label: "Hoạt động", href: `${base}/activities` }, { label: q.data?.activity.title ?? "Chi tiết" }]}
        subtitle={q.data ? <>Hạn {fmtDate(q.data.activity.dueDate)} · Tạo bởi {q.data.createdByName}</> : undefined} />
      <QueryState query={q} skeleton="detail">
        {(d) => <Suspense><DetailBody d={d} /></Suspense>}
      </QueryState>
    </div>
  );
}

function DetailBody({ d }: { d: Detail }) {
  const { base, header, readOnly,schoolId,yearId,classId } = useClassroom();
  const a = d.activity;
  const today = useCtx().today;
  const st = activityState({ status: a.status, dueSoon: a.status === "active" && a.dueDate >= today && daysBetween(today, a.dueDate) <= 7, overdue: a.status === "active" && a.dueDate < today });
  const [intent, setIntent] = useState<StatusIntent | null>(null);
  const [record, setRecord] = useState<{ studentId?: string } | null>(null);
  const canManage = d.canManage && !readOnly;
  const canEvidence = d.canEvidence && !readOnly && a.status === "active";
  const publish=useCommand((ctx)=>activitiesRepo.publish(ctx,schoolId,yearId,classId,a),{success:'Đã công bố hoạt động cho đúng gia đình được giao'});
  const p = d.progress;
  const evidence: Ev[] = useMemo(() => d.students.flatMap((s) => s.evidence.map((e) => ({ ...e, studentName: s.fullName }))).sort((x, y) => y.uploadedAt.localeCompare(x.uploadedAt)), [d.students]);
  const pendingCount = evidence.filter((e) => e.status === "pending").length;
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ActivityArt kind={a.illustration} className="h-[110px] w-full flex-none sm:w-[150px]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={st.tone}>{st.label}</Badge>
              {a.publishedToParents ? <Badge tone="info" dot={false}>Gia đình học sinh được giao đã thấy</Badge> : <Badge tone="neutral" dot={false}>Gia đình chưa thấy</Badge>}
              {a.evidenceRequired && <Badge tone="purple" dot={false}>Yêu cầu minh chứng</Badge>}
            </div>
            <p className="mt-2 text-sm text-body">{a.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {canManage && a.status !== "closed" && <ButtonLink href={`${base}/activities/${a.id}/edit`} size="sm" icon={<Edit3 className="size-4" />}>Sửa</ButtonLink>}
              {canEvidence && <Button size="sm" variant="primary" icon={<Upload className="size-4" />} onClick={() => setRecord({})}>Ghi nhận minh chứng</Button>}
              {canEvidence&&canManage&&<ButtonLink size="sm" href={`${base}/activities/${a.id}/access`}>Link học sinh nộp & nhắc bài</ButtonLink>}
              {canManage && a.status === "draft" && <Button size="sm" variant="primary" icon={<Send className="size-4" />} onClick={() => setIntent({ activity:a, id: a.id, title: a.title, to: "active", fromDraft: true, dueDate: a.dueDate, assigned: p.total })}>Giao hoạt động</Button>}
              {canManage && a.status === "active" && <Button size="sm" variant="danger-soft" icon={<Lock className="size-4" />} onClick={() => setIntent({ activity:a, id: a.id, title: a.title, to: "closed", dueDate: a.dueDate })}>Kết thúc</Button>}
              {canManage && a.status === "closed" && <Button size="sm" icon={<PlayCircle className="size-4" />} onClick={() => setIntent({ activity:a, id: a.id, title: a.title, to: "active", dueDate: a.dueDate })}>Mở lại</Button>}
              {d.canPublish&&a.status!=='draft'&&<Button size="sm" variant="primary" icon={<Send className="size-4" />} loading={publish.pending} onClick={()=>publish.run()}>{a.publishedToParents?'Công bố lại':'Công bố'}</Button>}
              {publish.error&&<p role="alert" className="w-full text-sm text-danger-text">{publish.error.message}</p>}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-[13.5px] text-body">Tiến độ trên số học sinh được giao</p>
          <p className="mt-1 text-[28px] font-extrabold leading-tight text-ink tabular-nums">{p.approved}/{p.total}<span className="ml-2 text-base font-semibold text-muted">{fmtPercent(p.approved, p.total)}</span></p>
          <ProgressBar value={p.approved} total={p.total} showPercent={false} className="mt-2" />
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <li className="flex justify-between"><span className="text-body">Chờ duyệt</span><b className="tabular-nums">{p.pending}</b></li>
            <li className="flex justify-between"><span className="text-body">Cần bổ sung</span><b className="tabular-nums">{p.supplement}</b></li>
            <li className="flex justify-between"><span className="text-body">Đã nhận</span><b className="tabular-nums">{p.received}</b></li>
            <li className="flex justify-between"><span className="text-body">Chưa nhận</span><b className="tabular-nums">{p.notReceived}</b></li>
          </ul>
        </Card>
      </div>

      <Tabs tabs={[{ value: "info", label: "Thông tin" }, { value: "progress", label: "Tiến độ", count: p.total }, ...(d.canReadEvidence?[{ value: "evidence", label: "Minh chứng", count: evidence.length }]:[]), { value: "history", label: "Lịch sử" }]}>
        <TabPanel value="info">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <dl>
                <InfoRow label="Tên hoạt động">{a.title}</InfoRow>
                <InfoRow label="Hạn hoàn thành">{fmtDate(a.dueDate)}</InfoRow>
                <InfoRow label="Giao cho">{scopeLabel({ ...a, groupName: d.groupName }, header.size)} ({p.total} học sinh)</InfoRow>
                <InfoRow label="Minh chứng">{a.evidenceRequired ? "Bắt buộc — giáo viên ghi nhận" : "Không bắt buộc"}</InfoRow>
                <InfoRow label="Hiển thị cho gia đình">{a.publishedToParents ? "Gia đình thấy bản đã công bố; công bố lại để cập nhật thay đổi" : "Chưa công bố"}</InfoRow>
                <InfoRow label="Người tạo">{d.createdByName}</InfoRow>
                <InfoRow label="Tạo lúc">{fmtDateTime(a.createdAt)}</InfoRow>
                <InfoRow label="Phiên bản">{a.version}</InfoRow>
              </dl>
            </Card>
            <div className="space-y-3">
              <Callout tone="warning" icon={<Info />} title="Không tự cộng điểm thi đua">Hoàn thành hoặc duyệt minh chứng không làm thay đổi điểm thi đua của học sinh.</Callout>
              <Callout tone="info" icon={<Info />} title="Minh chứng do giáo viên ghi nhận">Học sinh và phụ huynh không tải tệp lên hệ thống. Giáo viên ghi nhận, duyệt và quyết định chia sẻ tệp với phụ huynh của đúng em đó.</Callout>
            </div>
          </div>
        </TabPanel>
        <TabPanel value="progress"><ProgressTable d={d} canEvidence={!!d.canEvidence && !readOnly} onRecord={(sid) => setRecord({ studentId: sid })} activeRecord={canEvidence} /></TabPanel>
        <TabPanel value="evidence"><EvidenceGrid items={evidence} canReview={!!d.canEvidence && !readOnly} pendingCount={pendingCount} activityTitle={a.title} /></TabPanel>
        <TabPanel value="history">
          <Card className="p-5">
            <Timeline items={d.history.map((h) => ({ id: h.id, at: h.at, title: h.action.replace(" (tệp lưu cục bộ, mô phỏng)", ""), detail: <>{h.entityLabel}{h.reason ? <span className="block text-muted">Lý do/ghi chú: {h.reason}</span> : null}</>, actor: h.actorName, tone: /Duyệt/.test(h.action) ? "green" : /bổ sung|Từ chối|Kết thúc/.test(h.action) ? "red" : "blue" }))} empty="Chưa có lịch sử cho hoạt động này." />
          </Card>
        </TabPanel>
      </Tabs>

      <ActivityStatusConfirm intent={intent} onClose={() => setIntent(null)} />
      <RecordEvidenceDialog open={!!record} onOpenChange={(o) => { if (!o) setRecord(null); }} activityId={a.id} studentId={record?.studentId}
        activities={[{ id: a.id, title: a.title, assigned: a.assignedStudentIds }]} students={d.students.filter((s) => s.stillEnrolled).map((s) => ({ id: s.id, fullName: s.fullName }))} />
    </>
  );
}

const STATUS_OPTIONS = (Object.keys(submissionStatus) as SubmissionStatus[]).map((k) => ({ value: k, label: submissionStatus[k].label }));

function ProgressTable({ d, canEvidence, onRecord, activeRecord }: { d: Detail; canEvidence: boolean; onRecord: (sid: string) => void; activeRecord: boolean }) {
  const { schoolId, yearId, classId } = useClassroom();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"name" | "status">("name");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const groups = [...new Set(d.students.map((s) => s.groupName).filter(Boolean) as string[])].sort();
  const filtered = useMemo(() => d.students.filter((s) => matches(q, s.fullName, s.code) && (!status || s.status === status) && (!group || s.groupName === group))
    .sort((x, y) => sort === "status" ? x.status.localeCompare(y.status) : 0), [d.students, q, status, group, sort]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const rows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const active = !!(q || status || group);
  const cols: Column<Row>[] = [
    { key: "name", header: "Học sinh", sortable: true, cell: (s) => <div><p className="font-semibold text-ink">{s.fullName}</p><p className="text-[12px] text-muted">{s.code}{!s.stillEnrolled && " · đã chuyển khỏi lớp"}</p></div> },
    { key: "group", header: "Tổ", cell: (s) => s.groupName ?? "—", hideBelow: "md" },
    { key: "status", header: "Tình trạng", sortable: true, cell: (s) => <Badge tone={submissionStatus[s.status].tone}>{submissionStatus[s.status].label}</Badge> },
    { key: "note", header: "Ghi chú", cell: (s) => <span className="text-[13px]">{s.note ?? "—"}</span>, hideBelow: "lg" },
    { key: "ev", header: "Minh chứng", align: "center", cell: (s) => d.canReadEvidence?s.evidence.length || "—":"Không có quyền" },
    { key: "upd", header: "Cập nhật", cell: (s) => <span className="text-[12.5px] tabular-nums">{s.updatedAt ? fmtDateTime(s.updatedAt) : "—"}</span>, hideBelow: "md" },
    ...(activeRecord ? [{ key: "act", header: "", cell: (s: Row) => s.stillEnrolled ? <Button size="sm" variant="ghost" icon={<Upload className="size-4" />} onClick={() => onRecord(s.id)}>Ghi nhận</Button> : null }] : []),
  ];
  return (
    <Card>
      <CardHeader title="Tình trạng từng học sinh được giao" subtitle={`${d.progress.total} học sinh được giao — không tính học sinh ngoài phạm vi giao`} />
      <FilterBar q={q} onQ={(v) => { setQ(v); setPage(1); }} placeholder="Tìm tên hoặc mã học sinh" active={active} onReset={() => { setQ(""); setStatus(""); setGroup(""); setPage(1); }}>
        <InlineSelect label="Lọc tình trạng" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} allLabel="Tất cả tình trạng" />
        {groups.length > 1 && <InlineSelect label="Lọc tổ" value={group} onChange={(v) => { setGroup(v); setPage(1); }} options={groups.map((g) => ({ value: g, label: g }))} allLabel="Tất cả tổ" />}
      </FilterBar>
      {canEvidence && (
        <BulkSelectionBar selected={selected} pageIds={rows.map((r) => r.id)} allIds={filtered.map((r) => r.id)} onChange={setSelected} what="học sinh">
          <Button size="sm" variant="primary" onClick={() => setBulk(true)}>Đổi tình trạng</Button>
        </BulkSelectionBar>
      )}
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} selectable={canEvidence} selected={selected} onSelectedChange={setSelected} sort={sort} dir="asc" onSort={(k) => setSort(k as "name" | "status")}
        caption="Tình trạng hoạt động theo học sinh" minWidth={640} empty={active ? <EmptyFiltered what="học sinh" onReset={() => { setQ(""); setStatus(""); setGroup(""); }} /> : <EmptyState compact title="Chưa giao học sinh nào" />} />
      <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} what="học sinh" />
      <BulkStatusDialog open={bulk} onOpenChange={setBulk} ids={[...selected]} versions={Object.fromEntries(d.students.map(s=>[s.id,{id:s.participantId,version:s.version}]))} activityId={d.activity.id} onDone={() => setSelected(new Set())} key={bulk ? "o" : "c"} schoolId={schoolId} yearId={yearId} classId={classId} />
    </Card>
  );
}

function BulkStatusDialog({ open, onOpenChange, ids, versions:initialVersions, activityId, onDone, schoolId, yearId, classId }: { open: boolean; onOpenChange: (o: boolean) => void; ids: string[]; versions:Record<string,{id:string;version:number}>; activityId: string; onDone: () => void; schoolId: string; yearId: string; classId: string }) {
  const [versions]=useState(initialVersions);
  const [status, setStatus] = useState<SubmissionStatus | "">("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cmd = useCommand((ctx, input: Parameters<typeof activitiesRepo.setSubmission>[4]) => activitiesRepo.setSubmission(ctx, schoolId, yearId, classId, input), {
    success: (n) => `Đã cập nhật tình trạng ${n} học sinh`,
    onError: (e) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? { form: e.message }); },
  });
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!status) e.status = "Chọn tình trạng mới";
    if (status === "needs_supplement" && note.trim().length < 5) e.note = "Ghi rõ nội dung cần bổ sung (tối thiểu 5 ký tự)";
    setErrors(e);
    if (Object.keys(e).length || !status) return;
    const r = await cmd.run({ activityId, studentIds: ids, versions, status, note: note.trim() || undefined });
    if (r !== undefined) { onOpenChange(false); onDone(); }
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" busy={cmd.pending} title="Đổi tình trạng hàng loạt" description={`${ids.length} học sinh đã chọn`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit}>Cập nhật</Button></>}>
      <div className="space-y-3">
        <SelectField label="Tình trạng mới" required value={status} placeholder="Chọn tình trạng" options={STATUS_OPTIONS} onChange={(e) => { setStatus(e.target.value as SubmissionStatus); setErrors({}); }} error={errors.status} />
        <TextArea label={status === "needs_supplement" ? "Nội dung cần bổ sung" : "Ghi chú"} required={status === "needs_supplement"} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxChars={300} error={errors.note} />
        <p className="text-[12.5px] text-muted">Đổi tình trạng không tạo minh chứng và không cộng điểm thi đua.</p>
        {errors.form && <p className="error-text" role="alert">{errors.form}</p>}
        {cmd.error?.code!=='VALIDATION'&&cmd.error&&<p className="error-text" role="alert">{cmd.error.message}</p>}
      </div>
    </Modal>
  );
}

function EvidenceGrid({ items, canReview, pendingCount, activityTitle }: { items: Ev[]; canReview: boolean; pendingCount: number; activityTitle: string }) {
  const [view, setView] = useState<Ev | null>(null);
  const [review, setReview] = useState<{ ids: string[]; decision: ReviewDecision; subject: string } | null>(null);
  const [status, setStatus] = useState("");
  const shown = items.filter((e) => !status || e.status === status);
  return (
    <Card>
      <CardHeader title="Minh chứng đã ghi nhận" icon={<FileImage className="size-5 text-primary" />} subtitle={`${items.length} minh chứng · ${pendingCount} chờ duyệt`}
        action={<InlineSelect label="Lọc trạng thái minh chứng" value={status} onChange={setStatus} allLabel="Tất cả" options={[{ value: "pending", label: "Chờ duyệt" }, { value: "approved", label: "Đã duyệt" }, { value: "supplement", label: "Cần bổ sung" }, { value: "rejected", label: "Từ chối" }]} />} />
      {!items.length ? <EmptyState compact icon={<FileImage className="size-6" />} title="Chưa có minh chứng" description="Giáo viên bấm “Ghi nhận minh chứng” để thêm ảnh hoặc PDF nhận được." /> : !shown.length ? <EmptyFiltered what="minh chứng" onReset={() => setStatus("")} /> : (
        <ul className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((e) => (
            <li key={e.id} className="flex flex-col rounded-2xl border border-line bg-white p-2.5">
              <button type="button" onClick={() => setView(e)} className="block rounded-lg" aria-label={`Xem minh chứng của ${e.studentName}`}>{e.file ? <FileThumb file={e.file} /> : null}</button>
              <p className="mt-2 truncate text-sm font-semibold text-ink">{e.studentName}</p>
              <p className="text-[12px] text-muted">Giáo viên ghi nhận: {e.uploadedByName} · {fmtDate(e.uploadedAt)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5"><EvidenceStatusBadge status={e.status} />{e.sharedWithParent && <Badge tone="info" dot={false}>Đã chia sẻ phụ huynh</Badge>}</div>
              {e.reviewNote && <p className="mt-1 line-clamp-2 text-[12px] text-body">Ghi chú: {e.reviewNote}</p>}
              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setView(e)}>Xem</Button>
                {canReview && e.status === "pending" && <>
                  <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => setReview({ ids: [e.id], decision: "approved", subject: `${e.studentName} — ${activityTitle}` })}>Duyệt</Button>
                  <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setReview({ ids: [e.id], decision: "supplement", subject: `${e.studentName} — ${activityTitle}` })}>Bổ sung</Button>
                  <Button size="sm" variant="danger-soft" icon={<XCircle className="size-4" />} onClick={() => setReview({ ids: [e.id], decision: "rejected", subject: `${e.studentName} — ${activityTitle}` })}>Từ chối</Button>
                </>}
                {canReview && e.status === "approved" && <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setReview({ ids: [e.id], decision: "supplement", subject: `${e.studentName} — ${activityTitle}` })}>Yêu cầu bổ sung</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <FileViewerDialog open={!!view} onOpenChange={(o) => { if (!o) setView(null); }} file={view?.file}
        meta={view ? [{ label: "Học sinh", value: view.studentName }, { label: "Hoạt động", value: activityTitle }, { label: "Giáo viên ghi nhận", value: view.uploadedByName }, { label: "Trạng thái", value: <EvidenceStatusBadge status={view.status} /> }] : undefined} />
      <ReviewEvidenceDialog open={!!review} onOpenChange={(o) => { if (!o) setReview(null); }} evidenceIds={review?.ids ?? []} evidenceVersions={Object.fromEntries(items.map(e=>[e.id,e.version]))} decision={review?.decision ?? "approved"} subject={review?.subject ?? ""} />
    </Card>
  );
}
