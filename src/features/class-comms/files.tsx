"use client";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Download, Eye, FolderOpen, Info, Share2, ShieldOff, Upload } from "lucide-react";
import type { FileShare } from "@/lib/model/types";
import { activitiesRepo, UPLOAD_LIMITS } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtBytes, fmtDateTime } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { DiscardBar, FileViewerDialog } from "@/features/activities/evidence-dialogs";
import { SHARE_LABEL } from "@/features/activities/shared";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge, DemoTag, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { ActionMenu } from "@/components/ui/menu";
import { Combobox } from "@/components/ui/combobox";
import { ErrorSummary, InlineSelect, RadioGroup } from "@/components/ui/form";
import { FileDropzone, downloadFileAsset } from "@/components/ui/file";
import { useUnsavedChanges } from "@/components/ui/guards";
import { useToast } from "@/components/ui/toast";
import { DeniedState, EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { DataTable, FilterBar, Pagination, type Column } from "@/components/data/table";

type Row = Awaited<ReturnType<typeof activitiesRepo.files>>[number];

const ACCEPT = [...UPLOAD_LIMITS.types, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", ".docx", ".xlsx", ".csv"];
const SHARE_OPTS: { value: FileShare; label: string; description: string }[] = [
  { value: "internal", label: "Nội bộ", description: "Chỉ giáo viên và nhân sự có quyền của lớp." },
  { value: "class_parents", label: "Phụ huynh cả lớp", description: "Gia đình mọi học sinh của lớp thấy qua link tra cứu (tài liệu chung, không dùng cho ảnh học sinh)." },
  { value: "student_parent", label: "Riêng phụ huynh một em", description: "Chỉ gia đình của học sinh được chọn thấy." },
];
const SHARE_TONE: Record<FileShare, "neutral" | "info" | "purple"> = { internal: "neutral", class_parents: "info", student_parent: "purple" };

function kind(mime: string) {
  if (mime.startsWith("image/")) return "Ảnh";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessing")) return "Word";
  if (mime.includes("spreadsheet")) return "Excel";
  if (mime === "text/csv") return "CSV";
  return "Tệp";
}

/** CL24 — class files: list, upload (local only), preview/download, share scope, archive, revoke sharing. */
export function ClassFilesPage() {
  const { schoolId, yearId, classId, header, can } = useClassroom();
  const allowed = can("files.manage");
  const [q, setQ] = useState("");
  const [share, setShare] = useState("");
  const [status, setStatus] = useState("");
  const query = useRepo(["class-files", classId, q, share, status], (ctx) => activitiesRepo.files(ctx, schoolId, yearId, classId, { q, share: share || undefined, status: status || undefined }), { enabled: allowed });
  return (
    <div className="page">
      <ClassHeader variant="compact" title="Tệp lớp" subtitle={<>Tài liệu của lớp {header.class.name} và phạm vi chia sẻ với gia đình</>} />
      {!allowed ? <div className="card"><DeniedState message="Chỉ giáo viên chủ nhiệm quản lý tệp của lớp." /></div> : (
        <QueryState query={query} skeleton="table">
          {(rows) => <Body rows={rows} q={q} setQ={setQ} share={share} setShare={setShare} status={status} setStatus={setStatus} />}
        </QueryState>
      )}
    </div>
  );
}

function Body({ rows, q, setQ, share, setShare, status, setStatus }: { rows: Row[]; q: string; setQ: (v: string) => void; share: string; setShare: (v: string) => void; status: string; setStatus: (v: string) => void }) {
  const { schoolId, yearId, classId, readOnly } = useClassroom();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [upload, setUpload] = useState(false);
  const [view, setView] = useState<Row | null>(null);
  const [shareFor, setShareFor] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<{ row: Row; kind: "archive" | "restore" | "unshare" } | null>(null);
  const update = useCommand((ctx, id: string, patch: Parameters<typeof activitiesRepo.updateFile>[5]) => activitiesRepo.updateFile(ctx, schoolId, yearId, classId, id, patch), {
    success: (f) => (f.status === "archived" ? "Đã lưu trữ tệp" : confirm?.kind === "unshare" ? "Đã thu hồi chia sẻ — tệp chỉ còn nội bộ" : confirm?.kind === "restore" ? "Đã khôi phục tệp" : "Đã đổi phạm vi chia sẻ"),
  });
  const canEdit = !readOnly;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pageCount);
  const slice = rows.slice((cur - 1) * pageSize, cur * pageSize);
  const active = !!(q || share || status);
  const reset = () => { setQ(""); setShare(""); setStatus(""); setPage(1); };
  const dl = async (f: Row) => { if (!(await downloadFileAsset(f))) toast.push({ tone: "error", title: "Không tải được tệp", detail: "Nội dung tệp không còn trên trình duyệt này (lưu cục bộ, mô phỏng)." }); };
  const cols: Column<Row>[] = [
    { key: "name", header: "Tên tệp", cell: (f) => <button type="button" className="text-left font-semibold text-ink hover:text-primary-strong hover:underline" onClick={() => setView(f)}>{f.name}</button> },
    { key: "kind", header: "Loại", cell: (f) => kind(f.mime), hideBelow: "sm" },
    { key: "size", header: "Dung lượng", align: "right", cell: (f) => <span className="tabular-nums">{fmtBytes(f.size)}</span>, hideBelow: "md" },
    { key: "owner", header: "Người tải", cell: (f) => <span className="text-[13px]">{f.ownerName}<br /><span className="text-muted tabular-nums">{fmtDateTime(f.createdAt)}</span></span>, hideBelow: "md" },
    { key: "share", header: "Phạm vi chia sẻ", cell: (f) => <div><Badge tone={SHARE_TONE[f.share]} dot={false}>{SHARE_LABEL[f.share]}</Badge>{f.studentName && f.share === "student_parent" && <p className="mt-0.5 text-[12px] text-muted">{f.studentName}</p>}</div> },
    { key: "status", header: "Trạng thái", cell: (f) => <Badge tone={PUBLICATION_STATUS[f.status]?.tone ?? "neutral"}>{f.status === "active" ? "Đang dùng" : PUBLICATION_STATUS[f.status]?.label ?? f.status}</Badge> },
    { key: "act", header: "", align: "right", cell: (f) => (
      <ActionMenu label={`Thao tác cho ${f.name}`} items={[
        { label: "Xem trước", icon: <Eye />, onSelect: () => setView(f), disabled: f.status === "revoked" },
        { label: "Tải xuống", icon: <Download />, onSelect: () => dl(f), disabled: f.status === "revoked" },
        ...(canEdit && f.status === "active" ? [
          { label: "Đổi phạm vi chia sẻ", icon: <Share2 />, onSelect: () => setShareFor(f) },
          ...(f.share !== "internal" ? [{ label: "Thu hồi chia sẻ", icon: <ShieldOff />, danger: true, onSelect: () => setConfirm({ row: f, kind: "unshare" }) }] : []),
          { label: "Lưu trữ", icon: <Archive />, separatorBefore: true, onSelect: () => setConfirm({ row: f, kind: "archive" }) },
        ] : []),
        ...(canEdit && f.status === "archived" ? [{ label: "Khôi phục", icon: <ArchiveRestore />, onSelect: () => setConfirm({ row: f, kind: "restore" }) }] : []),
      ]} />
    ) },
  ];
  return (
    <>
      <Callout tone="info" icon={<Info />} title="Không có thư viện ảnh học sinh công khai">Tệp chỉ dùng cho tài liệu của lớp. Ảnh minh chứng của từng em nằm trong mục Minh chứng và chỉ chia sẻ với phụ huynh của đúng em đó. Tệp tải lên chỉ lưu trên trình duyệt này (mô phỏng).</Callout>
      <Card>
        <CardHeader title="Tệp của lớp" icon={<FolderOpen className="size-5 text-primary" />} subtitle={`${rows.length} tệp${active ? " khớp bộ lọc" : ""}`}
          action={canEdit ? <Button variant="primary" size="sm" icon={<Upload className="size-4" />} onClick={() => setUpload(true)}>Tải tệp lên</Button> : undefined} />
        <FilterBar q={q} onQ={(v) => { setQ(v); setPage(1); }} placeholder="Tìm tên tệp" active={active} onReset={reset}>
          <InlineSelect label="Lọc phạm vi chia sẻ" value={share} onChange={(v) => { setShare(v); setPage(1); }} options={SHARE_OPTS.map((s) => ({ value: s.value, label: s.label }))} allLabel="Mọi phạm vi" />
          <InlineSelect label="Lọc trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "active", label: "Đang dùng" }, { value: "archived", label: "Lưu trữ" }, { value: "revoked", label: "Đã thu hồi" }]} allLabel="Đang dùng và lưu trữ" />
        </FilterBar>
        <DataTable rows={slice} columns={cols} rowKey={(r) => r.id} caption="Tệp của lớp" minWidth={720}
          empty={active ? <EmptyFiltered what="tệp" onReset={reset} /> : <EmptyState compact icon={<FolderOpen className="size-6" />} title="Lớp chưa có tệp" description="Tải tài liệu chung của lớp (PDF, ảnh, Word, Excel, CSV) — tối đa 5 MB mỗi tệp." />} />
        <Pagination page={cur} pageCount={pageCount} total={rows.length} pageSize={pageSize} onPage={setPage} what="tệp" />
      </Card>
      <UploadDialog open={upload} onOpenChange={setUpload} />
      <FileViewerDialog open={!!view} onOpenChange={(o) => { if (!o) setView(null); }} file={view}
        meta={view ? [{ label: "Người tải", value: view.ownerName }, ...(view.studentName ? [{ label: "Học sinh", value: view.studentName }] : [])] : undefined} />
      <ShareDialog row={shareFor} onClose={() => setShareFor(null)} run={async (id, s) => !!(await update.run(id, { share: s }))} busy={update.pending} />
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }} busy={update.pending}
        title={confirm?.kind === "archive" ? "Lưu trữ tệp" : confirm?.kind === "restore" ? "Khôi phục tệp" : "Thu hồi chia sẻ tệp"}
        object={confirm?.row.name} variant={confirm?.kind === "restore" ? "primary" : "danger"}
        confirmLabel={confirm?.kind === "archive" ? "Lưu trữ" : confirm?.kind === "restore" ? "Khôi phục" : "Thu hồi chia sẻ"}
        consequence={confirm?.kind === "archive" ? "Tệp chuyển sang “Lưu trữ”, không còn hiển thị cho gia đình; tệp không bị xóa và có thể khôi phục." : confirm?.kind === "restore" ? "Tệp trở lại “Đang dùng” với phạm vi chia sẻ trước đó." : `Tệp chuyển về “Nội bộ”. Gia đình (${confirm ? SHARE_LABEL[confirm.row.share] : ""}) không xem được ở lần mở tiếp theo; bản đã tải về trước đó không thu hồi được.`}
        onConfirm={async () => { if (!confirm) return; const patch = confirm.kind === "archive" ? { status: "archived" as const } : confirm.kind === "restore" ? { status: "active" as const } : { share: "internal" as FileShare }; if (await update.run(confirm.row.id, patch)) setConfirm(null); }} />
    </>
  );
}

function ShareDialog({ row, onClose, run, busy }: { row: Row | null; onClose: () => void; run: (id: string, s: FileShare) => Promise<boolean>; busy: boolean }) {
  const [v, setV] = useState<FileShare>("internal");
  useEffect(() => { if (row) setV(row.share); }, [row]);
  return (
    <Modal open={!!row} onOpenChange={(o) => { if (!o) onClose(); }} size="sm" busy={busy} title="Đổi phạm vi chia sẻ" description={row?.name}
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button><Button variant="primary" loading={busy} disabled={!row || v === row.share} onClick={async () => { if (row && await run(row.id, v)) onClose(); }}>Lưu</Button></>}>
      <RadioGroup<FileShare> label="Phạm vi" value={v} onChange={setV}
        options={SHARE_OPTS.map((s) => ({ ...s, disabled: s.value === "student_parent" && !row?.studentId, description: s.value === "student_parent" && !row?.studentId ? "Tệp chưa gắn với một học sinh — tải lại tệp với phạm vi này." : s.value === "student_parent" && row?.studentName ? `Chỉ gia đình em ${row.studentName}.` : s.description }))} />
    </Modal>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { schoolId, yearId, classId } = useClassroom();
  const roster = useRepo(["activity-form-options", classId], (ctx) => activitiesRepo.formOptions(ctx, schoolId, yearId, classId), { enabled: open });
  const [file, setFile] = useState<File | null>(null);
  const [share, setShare] = useState<FileShare>("internal");
  const [studentId, setStudentId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [askDiscard, setAskDiscard] = useState(false);
  useEffect(() => { if (open) { setFile(null); setShare("internal"); setStudentId(""); setErrors({}); setAskDiscard(false); } }, [open]);
  const dirty = open && (!!file || share !== "internal");
  useUnsavedChanges(dirty);
  const cmd = useCommand((ctx, input: Parameters<typeof activitiesRepo.uploadFile>[4]) => activitiesRepo.uploadFile(ctx, schoolId, yearId, classId, input), {
    success: "Đã tải tệp lên (lưu trên trình duyệt này)",
    onError: (e) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? { form: e.message }); },
  });
  const students = useMemo(() => (roster.data?.students ?? []).map((s) => ({ value: s.id, label: s.fullName })), [roster.data]);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!file) e.file = "Chọn tệp";
    if (share === "student_parent" && !studentId) e.studentId = "Chọn học sinh được chia sẻ";
    if (file && share === "class_parents" && file.type.startsWith("image/")) e.share = "Không chia sẻ ảnh cho phụ huynh cả lớp — chọn Nội bộ hoặc Riêng phụ huynh một em";
    setErrors(e);
    if (Object.keys(e).length || !file) return;
    const type = file.type || (file.name.endsWith(".csv") ? "text/csv" : file.name.endsWith(".docx") ? ACCEPT[4] : file.name.endsWith(".xlsx") ? ACCEPT[5] : "");
    const r = await cmd.run({ file: { name: file.name, type, size: file.size, blob: file }, share, studentId: share === "student_parent" ? studentId : undefined });
    if (r) onOpenChange(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" busy={cmd.pending} title="Tải tệp lên" description="Tài liệu chung của lớp. Phụ huynh không tải tệp lên hệ thống."
      beforeClose={() => { if (dirty) { setAskDiscard(true); return false; } return true; }}
      footer={<><Button variant="ghost" disabled={cmd.pending} onClick={() => (dirty ? setAskDiscard(true) : onOpenChange(false))}>Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit}>Tải lên</Button></>}>
      <div className="space-y-4">
        {askDiscard && <DiscardBar text="Tệp đang chọn chưa được lưu." onKeep={() => setAskDiscard(false)} onDiscard={() => { setAskDiscard(false); setFile(null); onOpenChange(false); }} />}
        <ErrorSummary errors={errors} labels={{ file: "Tệp", studentId: "Học sinh", share: "Phạm vi", form: "Biểu mẫu" }} />
        <div data-field="file">
          {file ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-[#f7fbff] px-3.5 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{file.name}</span><span className="text-muted">{fmtBytes(file.size)}</span>
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Chọn tệp khác</Button>
            </div>
          ) : <FileDropzone accept={ACCEPT} maxBytes={UPLOAD_LIMITS.maxBytes} onFiles={(f) => { setFile(f[0] ?? null); setErrors((x) => ({ ...x, file: "" })); }} hint={`PDF, ảnh, Word, Excel, CSV — tối đa ${fmtBytes(UPLOAD_LIMITS.maxBytes)}.`} error={errors.file || undefined} />}
          <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted"><DemoTag />Tệp lưu trên trình duyệt này, không tải lên máy chủ.</p>
        </div>
        <div data-field="share"><RadioGroup<FileShare> label="Phạm vi chia sẻ" value={share} onChange={(v) => { setShare(v); setErrors((x) => ({ ...x, share: "" })); }} options={SHARE_OPTS} error={errors.share || undefined} /></div>
        {share === "student_parent" && <div data-field="studentId"><Combobox label="Học sinh" required value={studentId} onChange={(v) => setStudentId(String(v))} options={students} error={errors.studentId || undefined} placeholder="Tìm học sinh của lớp…" helper="Chỉ gia đình của em này thấy tệp." /></div>}
      </div>
    </Modal>
  );
}
