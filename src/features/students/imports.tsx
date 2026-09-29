"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, Download, FileSpreadsheet, FileText, GraduationCap, Users, School as SchoolIcon, CalendarDays, History, CheckCircle2, RefreshCw, SkipForward, AlertTriangle, XCircle, Info, ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { schoolRepo, studentsRepo } from "@/lib/repositories";
import { studentsExtraRepo, type ImportKind, type ImportKindInfo } from "@/lib/repositories/students-extra";
import type { ImportRowInput } from "@/lib/repositories/students";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDateTime, fmtNumber, fold } from "@/lib/formatters";
import { buildXLSX, downloadBlob, downloadCSV, downloadXLSX, parseTabularFile, sampleImportCSV, type ExportColumn } from "@/lib/export";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Badge, DemoTag, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, InlineSelect, RadioGroup, SelectField } from "@/components/ui/form";
import { FileDropzone } from "@/components/ui/file";
import { Stepper } from "@/components/ui/progress";
import { useUnsavedChanges } from "@/components/ui/guards";
import { DeniedState, EmptyFiltered, EmptyState, ErrorState, QueryState, Skeleton } from "@/components/ui/states";
import { DataTable, FilterBar, Pagination, useClientList, type Column } from "@/components/data/table";
import { IMPORT_RESULT } from "./shared";

const KIND_ICON: Record<ImportKind, React.ReactNode> = { students: <GraduationCap className="size-6" />, teachers: <Users className="size-6" />, classes: <SchoolIcon className="size-6" />, timetable: <CalendarDays className="size-6" /> };
const KIND_TONE: Record<ImportKind, "blue" | "green" | "amber" | "purple"> = { students: "blue", teachers: "purple", classes: "green", timetable: "amber" };

async function sampleStudentsTable() {
  const parsed = await parseTabularFile(new File([sampleImportCSV()], "mau.csv", { type: "text/csv" }));
  const cols: ExportColumn[] = parsed.headers.map((h, i) => ({ key: `c${i}`, label: h }));
  const rows = parsed.rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, v])));
  return { cols, rows };
}

async function downloadTemplate(k: ImportKindInfo, fmt: "csv" | "xlsx") {
  if (k.kind === "students") {
    if (fmt === "csv") { downloadBlob(new Blob([sampleImportCSV()], { type: "text/csv;charset=utf-8" }), "mau-nhap-hoc-sinh.csv"); return; }
    const { cols, rows } = await sampleStudentsTable();
    downloadBlob(await buildXLSX(cols, rows), "mau-nhap-hoc-sinh.xlsx");
    return;
  }
  const cols = k.columns.map((c) => ({ key: c.key, label: c.label }));
  if (fmt === "csv") downloadCSV(cols, k.sampleRows, `mau-nhap-${k.kind}.csv`);
  else await downloadXLSX(cols, k.sampleRows, `mau-nhap-${k.kind}.xlsx`);
}

/* ------------------------------ SC26 — import center ------------------------------ */
export function ImportsCenter({ schoolId }: { schoolId: string }) {
  const { can } = useSchool();
  const base = `/school/${schoolId}`;
  const kinds = useRepo(["import-kinds", schoolId], (ctx) => studentsExtraRepo.importKinds(ctx, schoolId), { enabled: can("import.run") });
  const hist = useRepo(["imports", schoolId], (ctx) => studentsRepo.imports(ctx, schoolId), { enabled: can("import.run") });
  const [status, setStatus] = useState("");
  const rows = useMemo(() => (hist.data ?? []).filter((i) => !status || (status === "errors" ? i.counts.errors > 0 : i.counts.errors === 0)), [hist.data, status]);
  const list = useClientList(rows, { search: (r) => `${r.fileName} ${r.batchId} ${r.className} ${r.createdByName}`, pageSize: 8 });
  if (!can("import.run")) return <div className="page"><DeniedState message="Bạn không có quyền nhập dữ liệu từ tệp." /></div>;
  type H = NonNullable<typeof hist.data>[number];
  const columns: Column<H>[] = [
    { key: "file", header: "Tệp", cell: (r) => <Link href={`${base}/imports/${r.id}`} className="block min-w-[180px] hover:underline"><span className="block font-semibold text-ink">{r.fileName}</span><span className="block text-[12px] text-muted">{r.batchId}</span></Link> },
    { key: "kind", header: "Loại", hideBelow: "md", cell: () => "Học sinh" },
    { key: "class", header: "Lớp nhận", cell: (r) => r.className },
    { key: "counts", header: "Kết quả", cell: (r) => <span className="flex flex-wrap gap-1"><Badge tone="success">+{r.counts.added}</Badge>{r.counts.updated > 0 && <Badge tone="info">{r.counts.updated} cập nhật</Badge>}{r.counts.skipped > 0 && <Badge tone="neutral">{r.counts.skipped} bỏ qua</Badge>}{r.counts.errors > 0 && <Badge tone="danger">{r.counts.errors} lỗi</Badge>}</span> },
    { key: "by", header: "Người nhập", hideBelow: "lg", cell: (r) => <span className="text-[13px]">{r.createdByName}<span className="block text-[12px] text-muted">{fmtDateTime(r.createdAt)}</span></span> },
    { key: "open", header: <span className="sr-only">Mở</span>, align: "right", cell: (r) => <Link href={`${base}/imports/${r.id}`} className="card-link">Kết quả</Link> },
  ];
  return (
    <div className="page">
      <PageHeader title="Trung tâm nhập dữ liệu" subtitle="Nhập từ tệp CSV/XLSX, đọc ngay trên trình duyệt. Không nối vào hệ thống khác, không xóa dữ liệu hiện có."
        breadcrumbs={[{ label: "Nhà trường", href: base }, { label: "Nhập dữ liệu" }]} illustration="/assets/illustrations/girl-clipboard.png"
        actions={<ButtonLink href={`${base}/imports/new`} variant="primary" icon={<Upload className="size-4" />}>Nhập danh sách học sinh</ButtonLink>} />
      {kinds.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
        : kinds.error ? <ErrorState error={kinds.error} onRetry={() => kinds.refetch()} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kinds.data!.map((k) => (
              <Card key={k.kind} className="flex flex-col p-5">
                <div className="flex items-center gap-3"><span className={`icon-tile tone-${KIND_TONE[k.kind]}`} aria-hidden>{KIND_ICON[k.kind]}</span><div><p className="text-[16px] font-bold text-ink">{k.title}</p>{!k.enabled && <DemoTag />}</div></div>
                <p className="mt-3 text-[13.5px] text-body">{k.description}</p>
                <p className="mt-2 text-[12.5px] text-muted">Cột: {k.columns.map((c) => c.label + (c.required ? "*" : "")).join(", ")}</p>
                {!k.enabled && <p className="mt-2 rounded-lg bg-neutral-bg px-3 py-2 text-[12.5px] text-neutral-text">Mô phỏng: chưa bật nhập tự động cho loại này trong bản demo. Có thể tải tệp mẫu để chuẩn bị dữ liệu.</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button size="sm" icon={<FileText className="size-4" />} onClick={() => downloadTemplate(k, "csv")}>Mẫu CSV</Button>
                  <Button size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => downloadTemplate(k, "xlsx")}>Mẫu XLSX</Button>
                  {k.enabled && <ButtonLink size="sm" variant="primary" href={`${base}/imports/new`} iconRight={<ArrowRight className="size-4" />}>Bắt đầu</ButtonLink>}
                </div>
              </Card>
            ))}
          </div>
        )}
      <Card>
        <CardHeader title="Lịch sử nhập" icon={<History className="size-5" />} subtitle="Mỗi lần nhập có mã lô (batch) để đối chiếu; nhập lại cùng tệp không tạo bản trùng." />
        <FilterBar q={list.q} onQ={list.setQ} placeholder="Tìm theo tên tệp, mã lô, lớp…" onReset={() => { list.setQ(""); setStatus(""); }} active={!!list.q || !!status}>
          <InlineSelect label="Lọc kết quả" allLabel="Tất cả lần nhập" value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={[{ value: "errors", label: "Có dòng lỗi" }, { value: "clean", label: "Không lỗi" }]} />
        </FilterBar>
        {hist.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : hist.error ? <ErrorState error={hist.error} onRetry={() => hist.refetch()} compact />
          : !hist.data!.length ? <EmptyState compact icon={<Upload className="size-6" />} title="Chưa có lần nhập nào" action={<ButtonLink href={`${base}/imports/new`} size="sm" variant="primary">Nhập danh sách</ButtonLink>} />
          : (
            <>
              <div className="px-4"><DataTable caption="Lịch sử nhập" rows={list.items} columns={columns} rowKey={(r) => r.id} empty={<EmptyFiltered onReset={() => { list.setQ(""); setStatus(""); }} what="lần nhập" />} minWidth={720} /></div>
              <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} onPage={list.setPage} what="lần nhập" />
            </>
          )}
      </Card>
    </div>
  );
}

/* ------------------------------ SC27 — import wizard ------------------------------ */
const STEPS = ["Tệp", "Ghép cột", "Kiểm tra", "Xem trước", "Nhập"];
type FieldKey = "code" | "fullName" | "dob" | "gender" | "guardianName" | "guardianRelation" | "guardianPhone";
const SYNONYMS: Record<FieldKey, string[]> = {
  code: ["ma hs", "ma hoc sinh", "ma", "code"], fullName: ["ho va ten", "ho ten", "ten hoc sinh", "ho ten hoc sinh", "full name", "name"], dob: ["ngay sinh", "sinh ngay", "dob"],
  gender: ["gioi tinh", "gender", "phai"], guardianName: ["nguoi giam ho", "phu huynh", "ho ten phu huynh", "ten phu huynh"], guardianRelation: ["quan he", "moi quan he"], guardianPhone: ["sdt giam ho", "sdt phu huynh", "so dien thoai", "dien thoai", "sdt"],
};

function autoMap(headers: string[]): Record<FieldKey, number> {
  const norm = headers.map((h) => fold(h).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim());
  const used = new Set<number>();
  const out = {} as Record<FieldKey, number>;
  (Object.keys(SYNONYMS) as FieldKey[]).forEach((k) => {
    let idx = norm.findIndex((h, i) => !used.has(i) && SYNONYMS[k].includes(h));
    if (idx < 0) idx = norm.findIndex((h, i) => !used.has(i) && SYNONYMS[k].some((s) => s.length > 3 && h.includes(s)));
    out[k] = idx;
    if (idx >= 0) used.add(idx);
  });
  return out;
}

export function ImportWizard({ schoolId }: { schoolId: string }) {
  const { can } = useSchool();
  const router = useRouter();
  const base = `/school/${schoolId}`;
  const kinds = useRepo(["import-kinds", schoolId], (ctx) => studentsExtraRepo.importKinds(ctx, schoolId), { enabled: can("import.run") });
  const classes = useRepo(["class-options", schoolId], (ctx) => schoolRepo.classOptions(ctx, schoolId));
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [parseErr, setParseErr] = useState<string>();
  const [parsing, setParsing] = useState(false);
  const [map, setMap] = useState<Record<FieldKey, number>>({} as Record<FieldKey, number>);
  const [mapErr, setMapErr] = useState<string>();
  const [classId, setClassId] = useState("");
  const [mode, setMode] = useState<"add_only" | "add_update">("add_only");
  const [includeWarnings, setIncludeWarnings] = useState(false);
  const [resultFilter, setResultFilter] = useState("");
  const [done, setDone] = useState(false);
  const fields = kinds.data?.find((k) => k.kind === "students")?.columns ?? [];
  const cls = (classes.data ?? []).filter((c) => c.status !== "archived");
  const targetClass = classId || cls.find((c) => c.status === "active")?.id || "";

  const inputRows: ImportRowInput[] = useMemo(() => {
    if (!file) return [];
    const get = (r: string[], k: FieldKey) => (map[k] >= 0 ? (r[map[k]] ?? "").trim() : undefined) || undefined;
    return file.rows.map((r, i) => ({ rowNo: i + 2, code: get(r, "code"), fullName: get(r, "fullName"), dob: get(r, "dob"), gender: get(r, "gender"), guardianName: get(r, "guardianName"), guardianRelation: get(r, "guardianRelation"), guardianPhone: get(r, "guardianPhone") }));
  }, [file, map]);
  const preview = useRepo(["import-preview", schoolId, targetClass, mode, file?.name, inputRows], (ctx) => studentsRepo.importPreview(ctx, schoolId, targetClass, inputRows, mode), { enabled: step >= 2 && !!targetClass && inputRows.length > 0, staleTime: 0 });
  const commit = useCommand((ctx, input: Parameters<typeof studentsRepo.importCommit>[2]) => studentsRepo.importCommit(ctx, schoolId, input), { success: (j) => `Đã nhập xong — ${j.counts.added} thêm mới, ${j.counts.updated} cập nhật` });
  useUnsavedChanges(!!file && !done && !commit.pending);

  const onFile = async (files: File[]) => {
    setParsing(true); setParseErr(undefined);
    try {
      const p = await parseTabularFile(files[0]);
      if (!p.headers.length || !p.rows.length) throw new Error("Tệp không có dòng dữ liệu (dòng đầu phải là tiêu đề cột).");
      if (p.rows.length > 500) throw new Error("Tệp có hơn 500 dòng. Hãy chia thành nhiều tệp nhỏ theo lớp.");
      setFile({ name: files[0].name, headers: p.headers, rows: p.rows });
      setMap(autoMap(p.headers));
    } catch (e) { setFile(null); setParseErr(e instanceof Error ? e.message : "Không đọc được tệp."); }
    setParsing(false);
  };
  const goMapping = () => {
    const missing = fields.filter((f) => f.required && !(map[f.key as FieldKey] >= 0)).map((f) => f.label);
    const used = Object.values(map).filter((v) => v >= 0);
    if (missing.length) { setMapErr(`Chưa ghép cột bắt buộc: ${missing.join(", ")}`); return; }
    if (new Set(used).size !== used.length) { setMapErr("Mỗi cột trong tệp chỉ được ghép cho một trường."); return; }
    setMapErr(undefined); setStep(2);
  };
  const counts = useMemo(() => {
    const c = { new: 0, update: 0, skip: 0, warning: 0, error: 0 };
    preview.data?.results.forEach((r) => { c[r.result]++; });
    return c;
  }, [preview.data]);
  const willWrite = counts.new + counts.update + (includeWarnings ? counts.warning : 0);
  const className = cls.find((c) => c.id === targetClass)?.name ?? "—";
  if (!can("import.run")) return <div className="page"><DeniedState message="Bạn không có quyền nhập dữ liệu từ tệp." /></div>;

  const ClassMode = (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Lớp nhận học sinh" required value={targetClass} onChange={(e) => setClassId(e.target.value)} options={cls.map((c) => ({ value: c.id, label: `${c.name}${c.status === "draft" ? " (nháp)" : ""}` }))} />
      <RadioGroup label="Cách xử lý học sinh đã có mã" value={mode} onChange={setMode} options={[{ value: "add_only", label: "Chỉ thêm mới", description: "Dòng trùng mã được bỏ qua" }, { value: "add_update", label: "Thêm mới và cập nhật", description: "Cập nhật ngày sinh, giới tính theo mã" }]} />
    </div>
  );
  type PR = NonNullable<typeof preview.data>["results"][number];
  const resultCols: Column<PR>[] = [
    { key: "row", header: "Dòng", cell: (r) => <span className="tabular-nums">{r.rowNo}</span> },
    { key: "name", header: "Họ và tên", cell: (r) => <span className="font-semibold text-ink">{r.fullName || <span className="text-muted">(trống)</span>}</span> },
    { key: "code", header: "Mã HS", hideBelow: "md", cell: (r) => r.code || "—" },
    { key: "dob", header: "Ngày sinh", cell: (r) => r.dob || "—" },
    { key: "gender", header: "Giới tính", hideBelow: "sm", cell: (r) => r.gender || "—" },
    { key: "result", header: "Kết quả", cell: (r) => <StatusBadge status={r.result} map={IMPORT_RESULT} /> },
    { key: "msg", header: "Ghi chú", cell: (r) => <span className={r.result === "error" ? "text-danger-text" : "text-[13px] text-body"}>{r.message}</span> },
  ];
  const shown = (preview.data?.results ?? []).filter((r) => !resultFilter || r.result === resultFilter);

  return (
    <div className="page">
      <PageHeader title="Nhập danh sách học sinh" subtitle="Đọc tệp ngay trên trình duyệt, kiểm tra từng dòng trước khi ghi. Không xóa danh sách hiện có." breadcrumbs={[{ label: "Nhập dữ liệu", href: `${base}/imports` }, { label: "Nhập danh sách" }]} />
      <Card className="p-4"><Stepper steps={STEPS} current={step} onStep={(i) => { if (i < step && !commit.pending) setStep(i); }} /></Card>

      {step === 0 && (
        <Card>
          <CardHeader title="Bước 1 — Chọn tệp" icon={<Upload className="size-5" />} subtitle="Dòng đầu là tiêu đề cột. Ngày sinh dạng dd/MM/yyyy. Giới tính: Nam hoặc Nữ." />
          <div className="space-y-4 px-5 pb-5">
            <FileDropzone accept={[".csv", ".xlsx"]} maxBytes={2 * 1024 * 1024} onFiles={onFile} label="Kéo thả tệp .csv hoặc .xlsx vào đây, hoặc bấm để chọn" error={parseErr} disabled={parsing} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([sampleImportCSV()], { type: "text/csv;charset=utf-8" }), "mau-nhap-hoc-sinh.csv")}>Tải tệp mẫu CSV</Button>
              <Button size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={async () => { const { cols, rows } = await sampleStudentsTable(); downloadBlob(await buildXLSX(cols, rows), "mau-nhap-hoc-sinh.xlsx"); }}>Tải tệp mẫu XLSX</Button>
            </div>
            {file && (
              <div className="space-y-3">
                <Callout tone="success" icon={<CheckCircle2 />} title={`Đã đọc ${file.name}`}>{fmtNumber(file.rows.length)} dòng dữ liệu · {file.headers.length} cột. Tệp chỉ nằm trên trình duyệt này.</Callout>
                <div className="table-wrap"><table className="table" style={{ minWidth: 560 }}><thead><tr><th>#</th>{file.headers.map((h, i) => <th key={i}>{h || `Cột ${i + 1}`}</th>)}</tr></thead>
                  <tbody>{file.rows.slice(0, 5).map((r, i) => <tr key={i}><td>{i + 2}</td>{file.headers.map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody></table></div>
                {file.rows.length > 5 && <p className="text-[12.5px] text-muted">Hiển thị 5 dòng đầu.</p>}
              </div>
            )}
            <div className="flex justify-end"><Button variant="primary" iconRight={<ArrowRight className="size-4" />} disabled={!file} onClick={() => setStep(1)}>Tiếp tục: ghép cột</Button></div>
          </div>
        </Card>
      )}

      {step === 1 && file && (
        <Card>
          <CardHeader title="Bước 2 — Ghép cột" icon={<FileSpreadsheet className="size-5" />} subtitle="Hệ thống tự ghép theo tên cột; kiểm tra và sửa nếu cần. Trường có dấu * là bắt buộc." />
          <div className="space-y-4 px-5 pb-5">
            {mapErr && <Callout tone="danger" icon={<XCircle />}>{mapErr}</Callout>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {fields.map((f) => {
                const idx = map[f.key as FieldKey] ?? -1;
                return (
                  <div key={f.key}>
                    <SelectField label={`${f.label}${f.required ? " *" : ""}`} value={String(idx)} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}
                      error={f.required && idx < 0 && mapErr ? "Chưa ghép" : undefined}
                      options={[{ value: "-1", label: "— Không dùng —" }, ...file.headers.map((h, i) => ({ value: String(i), label: h || `Cột ${i + 1}` }))]}
                      helper={idx >= 0 ? `Ví dụ: ${file.rows.find((r) => r[idx])?.[idx] ?? "(trống)"}` : f.required ? "Bắt buộc" : "Không bắt buộc"} />
                  </div>
                );
              })}
            </div>
            <Callout tone="info" icon={<Info />}>Không có cột CCCD, dân tộc, địa chỉ hay liên hệ riêng của học sinh — hệ thống không thu các thông tin này. Người giám hộ trong tệp được lưu ở trạng thái “Chưa xác minh”.</Callout>
            <div className="flex flex-wrap justify-between gap-2"><Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep(0)}>Quay lại</Button><Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={goMapping}>Kiểm tra dữ liệu</Button></div>
          </div>
        </Card>
      )}

      {(step === 2 || step === 3) && file && (
        <Card>
          <CardHeader title={step === 2 ? "Bước 3 — Kiểm tra từng dòng" : "Bước 4 — Xem trước"} icon={<ShieldCheck className="size-5" />} subtitle={step === 2 ? "Mỗi dòng được đánh dấu kết quả dự kiến. Chưa có dữ liệu nào được ghi." : "Chọn lớp, cách xử lý và xác nhận phạm vi trước khi nhập."} />
          <div className="space-y-4 px-5 pb-5">
            {ClassMode}
            {preview.isLoading || (preview.isFetching && !preview.data) ? <Skeleton className="h-40" /> : preview.error ? <ErrorState error={preview.error} onRetry={() => preview.refetch()} compact /> : preview.data && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {(Object.keys(IMPORT_RESULT) as (keyof typeof IMPORT_RESULT)[]).map((k) => (
                    <button key={k} type="button" onClick={() => setResultFilter(resultFilter === k ? "" : k)} aria-pressed={resultFilter === k} className={`rounded-xl border px-3 py-2.5 text-left ${resultFilter === k ? "border-[#9cc7f5] bg-primary-light" : "border-line bg-white hover:bg-[#f8fbff]"}`}>
                      <span className="block text-[22px] font-extrabold tabular-nums text-ink">{counts[k]}</span><StatusBadge status={k} map={IMPORT_RESULT} />
                    </button>
                  ))}
                </div>
                {step === 2 ? (
                  <DataTable caption="Kết quả kiểm tra từng dòng" rows={shown} columns={resultCols} rowKey={(r) => String(r.rowNo)} dense minWidth={720} empty={<EmptyFiltered onReset={() => setResultFilter("")} what="dòng" />} />
                ) : (
                  <div className="space-y-3">
                    <dl className="rounded-xl bg-[#f7fbff] px-4 py-2">
                      <InfoRow label="Tệp">{file.name} ({file.rows.length} dòng)</InfoRow>
                      <InfoRow label="Lớp nhận">{className} — hiện có {preview.data.classSize}/{preview.data.capacity} học sinh</InfoRow>
                      <InfoRow label="Sẽ ghi">{counts.new} thêm mới{includeWarnings ? ` + ${counts.warning} trùng tên (tạo hồ sơ riêng)` : ""} · {counts.update} cập nhật</InfoRow>
                      <InfoRow label="Không ghi">{counts.skip} bỏ qua (đã có) · {counts.error} lỗi{!includeWarnings && counts.warning ? ` · ${counts.warning} cảnh báo trùng tên` : ""}</InfoRow>
                    </dl>
                    {counts.warning > 0 && <Checkbox label={`Vẫn thêm ${counts.warning} dòng trùng tên với học sinh khác`} description="Mỗi dòng tạo một hồ sơ riêng, không gộp với học sinh đã có." checked={includeWarnings} onChange={setIncludeWarnings} />}
                    {preview.data.overCapacity && <Callout tone="warning" icon={<AlertTriangle />}>Số học sinh sau khi nhập có thể vượt sức chứa lớp {className} ({preview.data.capacity}).</Callout>}
                    <Callout tone="success" icon={<ShieldCheck />} title="Không xóa danh sách hiện có">Nhập chỉ thêm hoặc cập nhật theo mã. Học sinh đang có trong lớp giữ nguyên; dòng đã có sẽ được bỏ qua nên nhập lại cùng tệp không tạo bản trùng.</Callout>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep(step - 1)}>Quay lại</Button>
              {step === 2 ? <Button variant="primary" iconRight={<ArrowRight className="size-4" />} disabled={!preview.data} onClick={() => setStep(3)}>Xem trước</Button>
                : <Button variant="primary" iconRight={<ArrowRight className="size-4" />} disabled={!preview.data || willWrite === 0} onClick={() => setStep(4)}>Tiếp tục</Button>}
            </div>
            {step === 3 && preview.data && willWrite === 0 && <p className="text-right text-[13px] text-muted">Không có dòng hợp lệ để nhập.</p>}
          </div>
        </Card>
      )}

      {step === 4 && file && (
        <Card>
          <CardHeader title="Bước 5 — Nhập" icon={<Upload className="size-5" />} />
          <div className="space-y-4 px-5 pb-5">
            <p className="text-[15px] text-body">Ghi <b>{willWrite}</b> dòng vào lớp <b>{className}</b> ({mode === "add_only" ? "chỉ thêm mới" : "thêm mới và cập nhật theo mã"}). {counts.error} dòng lỗi sẽ có trong tệp lỗi để sửa và nhập lại.</p>
            <Callout tone="info" icon={<Info />}>Không xóa danh sách hiện có. Dữ liệu được lưu trong bản demo trên trình duyệt này.</Callout>
            <div className="flex flex-wrap justify-between gap-2">
              <Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep(3)} disabled={commit.pending}>Quay lại</Button>
              <Button variant="primary" icon={<Upload className="size-4" />} loading={commit.pending} onClick={async () => {
                const job = await commit.run({ classId: targetClass, fileName: file.name, rows: inputRows, mode, includeWarnings });
                if (job) { setDone(true); router.push(`${base}/imports/${job.id}`); }
              }}>Nhập {willWrite} dòng</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------ SC28 — import result ------------------------------ */
const ERR_COLS: ExportColumn[] = [{ key: "row", label: "Dòng" }, { key: "message", label: "Lỗi" }, { key: "Mã HS", label: "Mã HS" }, { key: "Họ và tên", label: "Họ và tên" }, { key: "Ngày sinh", label: "Ngày sinh" }, { key: "Giới tính", label: "Giới tính" }];

export function ImportResult({ schoolId, importId }: { schoolId: string; importId: string }) {
  const q = useRepo(["import-job", schoolId, importId], (ctx) => studentsRepo.importJob(ctx, schoolId, importId));
  const base = `/school/${schoolId}`;
  return (
    <QueryState query={q} skeleton="detail">
      {(j) => {
        const errRows = j.errorRows.map((e) => ({ row: e.row, message: e.message, ...e.data }));
        const fileBase = `loi-nhap-${j.batchId.toLowerCase()}`;
        return (
          <div className="page">
            <PageHeader title="Kết quả nhập" subtitle={`${j.fileName} → lớp ${j.className}`} badge={<Badge tone={j.counts.errors ? "warning" : "success"}>{j.counts.errors ? "Hoàn tất, có dòng lỗi" : "Hoàn tất"}</Badge>}
              breadcrumbs={[{ label: "Nhập dữ liệu", href: `${base}/imports` }, { label: j.batchId }]}
              actions={<>
                <ButtonLink href={`${base}/students`} icon={<GraduationCap className="size-4" />}>Về danh sách học sinh</ButtonLink>
                <ButtonLink href={`${base}/imports/new`} variant="primary" icon={<Upload className="size-4" />}>Nhập tệp khác</ButtonLink>
              </>} />
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <KpiCard label="Thêm mới" value={fmtNumber(j.counts.added)} icon={<CheckCircle2 className="size-7" />} tone="green" />
              <KpiCard label="Cập nhật" value={fmtNumber(j.counts.updated)} icon={<RefreshCw className="size-7" />} tone="blue" />
              <KpiCard label="Bỏ qua" value={fmtNumber(j.counts.skipped)} icon={<SkipForward className="size-7" />} tone="neutral" hint="Đã có hoặc không chọn thêm" />
              <KpiCard label="Lỗi" value={fmtNumber(j.counts.errors)} icon={<XCircle className="size-7" />} tone="pink" hint="Không được ghi" />
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader title={`Dòng lỗi (${j.errorRows.length})`} icon={<AlertTriangle className="size-5" />}
                  action={j.errorRows.length ? <>
                    <Button size="sm" icon={<FileText className="size-4" />} onClick={() => downloadCSV(ERR_COLS, errRows, `${fileBase}.csv`)}>Tải tệp lỗi CSV</Button>
                    <Button size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => downloadXLSX(ERR_COLS, errRows, `${fileBase}.xlsx`, { title: `Dòng lỗi — ${j.fileName}`, subtitle: `Lô ${j.batchId}` })}>Tải tệp lỗi XLSX</Button>
                  </> : undefined} />
                <div className="px-5 pb-5">
                  {j.errorRows.length === 0 ? <EmptyState compact icon={<CheckCircle2 className="size-6" />} title="Không có dòng lỗi" /> : (
                    <div className="table-wrap"><table className="table" style={{ minWidth: 560 }}>
                      <thead><tr><th>Dòng</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lỗi</th></tr></thead>
                      <tbody>{j.errorRows.map((e) => <tr key={e.row}><td className="tabular-nums">{e.row}</td><td>{e.data["Họ và tên"] || <span className="text-muted">(trống)</span>}</td><td>{e.data["Ngày sinh"] || "—"}</td><td className="text-danger-text">{e.message}</td></tr>)}</tbody>
                    </table></div>
                  )}
                </div>
              </Card>
              <div className="space-y-5">
                <Card>
                  <CardHeader title="Thông tin lần nhập" icon={<History className="size-5" />} />
                  <dl className="px-5 pb-4">
                    <InfoRow label="Mã lô (batch)"><span className="tabular-nums">{j.batchId}</span></InfoRow>
                    <InfoRow label="Tệp">{j.fileName}</InfoRow>
                    <InfoRow label="Lớp nhận"><Link href={`${base}/students`} className="hover:underline">{j.className}</Link></InfoRow>
                    <InfoRow label="Người nhập">{j.createdByName}</InfoRow>
                    <InfoRow label="Thời điểm">{fmtDateTime(j.createdAt)}</InfoRow>
                  </dl>
                </Card>
                <Callout tone="info" icon={<Info />} title="Nhập lại không nhân đôi">Sửa các dòng lỗi rồi nhập lại cả tệp: dòng trùng mã học sinh, hoặc trùng họ tên và ngày sinh đã có trong lớp, sẽ được bỏ qua. Danh sách hiện có không bị xóa hay thay thế.</Callout>
                <ButtonLink href={`${base}/imports`} icon={<ArrowLeft className="size-4" />}>Trung tâm nhập dữ liệu</ButtonLink>
              </div>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
