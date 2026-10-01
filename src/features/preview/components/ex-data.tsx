"use client";
import { useState, type ReactNode } from "react";
import { Link2, Link2Off, Clock3, Users, School, Info, Download } from "lucide-react";
import { activitiesRepo, studentsRepo } from "@/lib/repositories/demo-index";
import { useRepo } from "@/lib/query/demo-hooks";
import { fmtBytes, studentStatus, verificationStatus } from "@/lib/formatters";
import { DataTable, FilterBar, Pagination, BulkSelectionBar, useListQuery, type Column } from "@/components/data/table";
import { KpiCard } from "@/components/data/kpi";
import { ChartCard } from "@/components/data/charts";
import { PUBLICATION_STATUS, StatusBadge } from "@/components/ui/badge";
import { Avatar, Identity, SchoolMark } from "@/components/ui/avatar";
import { Card, CardHeader, CardLink, Callout, IconTile, InfoRow } from "@/components/ui/card";
import { Timeline, AuditDiff } from "@/components/ui/timeline";
import { ProgressBar, DonutProgress, Stepper } from "@/components/ui/progress";
import { FilePreview, downloadFileAsset } from "@/components/ui/file";
import { Button } from "@/components/ui/button";
import { InlineSelect } from "@/components/ui/form";
import { EmptyFiltered, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { registryById } from "@/lib/routing/registry";
import { NeedPersona, Frame } from "./common";

const A = "demo-school-a";
type StudentRow = Awaited<ReturnType<typeof studentsRepo.list>>["items"][number];

/** C025 + C026 + C027 + C036 — real paging/sort/filter from studentsRepo.list as u-hanh. */
function StudentsTable() {
  const lq = useListQuery({ pageSize: 10, sort: "name", dir: "asc" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const q = useRepo(["preview-students", lq.query], (ctx) => studentsRepo.list(ctx, A, lq.query));
  const cols: Column<StudentRow>[] = [
    { key: "name", header: "Học sinh", sortable: true, cell: (r) => <Identity name={r.fullName} sub={r.code} tone={r.avatarTone} size={32} /> },
    { key: "class", header: "Lớp", sortable: true, cell: (r) => r.className },
    { key: "status", header: "Trạng thái", cell: (r) => <StatusBadge status={r.status} map={studentStatus} /> },
    { key: "g", header: "Giám hộ đã xác minh", align: "right", hideBelow: "md", cell: (r) => r.verifiedGuardians },
  ];
  return (
    <div className="-mx-3 rounded-xl border border-line bg-white sm:mx-0">
      <div className="pt-3" />
      <FilterBar q={lq.query.q ?? ""} onQ={lq.setQ} placeholder="Tìm theo tên, mã học sinh…" active={lq.active} onReset={lq.reset}>
        <InlineSelect label="Trạng thái" value={lq.query.filters?.status ?? ""} onChange={(v) => lq.setFilter("status", v)} allLabel="Mọi trạng thái" options={Object.entries(studentStatus).map(([value, s]) => ({ value, label: s.label }))} />
      </FilterBar>
      <BulkSelectionBar selected={sel} pageIds={q.data?.items.map((r) => r.id) ?? []} allIds={q.data?.allIds ?? []} onChange={setSel} what="học sinh">
        <Button size="sm" variant="secondary" onClick={() => setSel(new Set())}>Bỏ chọn</Button>
      </BulkSelectionBar>
      {q.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div> : q.error ? <ErrorState compact error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <DataTable rows={q.data!.items} columns={cols} rowKey={(r) => r.id} sort={lq.query.sort} dir={lq.query.dir} onSort={lq.setSort} selectable selected={sel} onSelectedChange={setSel} caption="Học sinh trường A" minWidth={560}
            empty={lq.active ? <EmptyFiltered onReset={lq.reset} what="học sinh" /> : <EmptyState compact title="Chưa có học sinh" />} />
          <Pagination page={q.data!.page} pageCount={q.data!.pageCount} total={q.data!.total} pageSize={q.data!.pageSize} onPage={lq.setPage} onPageSize={lq.setPageSize} what="học sinh" />
        </>
      )}
    </div>
  );
}

function AccessKpis({ chart }: { chart?: boolean }) {
  const q = useRepo(["preview-access-kpi"], (ctx) => studentsRepo.accessList(ctx, A, { q: "", page: 1, pageSize: 1 }));
  if (q.isLoading) return <Skeleton className="h-24" />;
  if (q.error || !q.data) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  const k = q.data.kpi;
  const total = k.active + k.expired + k.revoked;
  if (chart) return <ChartCard title="Link tra cứu phụ huynh — trường A" kind="stack" denominatorLabel={`${total} link đã cấp trong trường A`} series={[{ label: "Đang hiệu lực", value: k.active, color: "var(--color-success)" }, { label: "Hết hạn", value: k.expired, color: "var(--color-faint)" }, { label: "Đã thu hồi", value: k.revoked, color: "var(--color-danger)" }]} />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard label="Link đang hiệu lực" value={k.active} icon={<Link2 className="size-6" />} tone="green" hint={`trên ${total} link đã cấp`} />
      <KpiCard label="Link hết hạn" value={k.expired} icon={<Clock3 className="size-6" />} tone="neutral" hint="Không có so sánh kỳ trước nên không hiện tăng/giảm" />
      <KpiCard label="Link đã thu hồi" value={k.revoked} icon={<Link2Off className="size-6" />} tone="pink" />
    </div>
  );
}

function TimelineExample() {
  const g = useRepo(["preview-o10", "gd-2"], (ctx) => studentsRepo.guardian(ctx, A, "gd-2"));
  if (g.isLoading) return <Skeleton className="h-24" />;
  if (g.error || !g.data) return <ErrorState compact error={g.error} onRetry={() => g.refetch()} />;
  const withDiff = g.data.history.find((h) => h.before || h.after);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Timeline items={g.data.history.slice(0, 5).map((h) => ({ id: h.id, at: h.at, title: h.action, detail: h.entityLabel, actor: h.actorName }))} empty="Người giám hộ này chưa có lịch sử." />
      <div className="space-y-2"><p className="text-[12.5px] font-semibold text-ink">Trước / sau {withDiff ? `(${withDiff.action})` : "(ví dụ trống)"}</p><AuditDiff before={withDiff?.before} after={withDiff?.after} /></div>
    </div>
  );
}

function ProgressExample() {
  const [step, setStep] = useState(1);
  return (
    <div className="space-y-4">
      <Stepper steps={["Chọn tệp", "Ánh xạ cột", "Kiểm tra", "Xác nhận"]} current={step} onStep={setStep} />
      <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Quay lại</Button><Button size="sm" variant="primary" disabled={step === 3} onClick={() => setStep(step + 1)}>Tiếp</Button></div>
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]">
        <ProgressBar value={step + 1} total={4} label={`Bước ${step + 1}/4`} />
        <DonutProgress value={step + 1} total={4} size={84} stroke={10} label={`${step + 1} trên 4 bước`}><span className="text-sm font-bold text-ink">{step + 1}/4</span></DonutProgress>
      </div>
    </div>
  );
}

function FileExample() {
  const files = useRepo(["preview-o28"], (ctx) => activitiesRepo.files(ctx, A, "y-a-2026", "c-a-10a1"));
  const [i, setI] = useState(0);
  if (files.isLoading) return <Skeleton className="h-40" />;
  if (files.error || !files.data) return <ErrorState compact error={files.error} onRetry={() => files.refetch()} />;
  if (!files.data.length) return <EmptyState compact title="Lớp chưa có tệp" />;
  const f = files.data[i % files.data.length];
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
      <FilePreview file={f} className="max-h-60" />
      <div className="space-y-2 text-[13px]">
        <p className="font-semibold text-ink break-all">{f.name}</p>
        <p className="text-muted">{f.mime} · {fmtBytes(f.size)} · {f.ownerName}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => void downloadFileAsset(f)}>Tải xuống</Button>
          {files.data.length > 1 && <Button size="sm" variant="ghost" onClick={() => setI(i + 1)}>Tệp khác ({(i % files.data.length) + 1}/{files.data.length})</Button>}
        </div>
      </div>
    </div>
  );
}

function EmptyExample() {
  const [filtered, setFiltered] = useState(true);
  return (
    <div className="space-y-2">
      <div className="flex gap-2"><Button size="sm" variant={filtered ? "primary" : "secondary"} onClick={() => setFiltered(true)}>Bộ lọc không khớp</Button><Button size="sm" variant={!filtered ? "primary" : "secondary"} onClick={() => setFiltered(false)}>Chưa có dữ liệu</Button></div>
      <Frame>{filtered ? <EmptyFiltered onReset={() => setFiltered(false)} what="học sinh" /> : <EmptyState compact title="Chưa có học sinh" description="Lớp chưa có học sinh. Người có quyền có thể nhập danh sách." />}</Frame>
    </div>
  );
}

export const DATA_EXAMPLES: Record<string, () => ReactNode> = {
  C025: () => <NeedPersona need={{ kind: "staff", userId: "u-hanh" }} why="Bảng đọc danh sách học sinh trường A qua studentsRepo.list (vai trò Quản trị trường A)."><StudentsTable /></NeedPersona>,
  C026: () => <p className="text-[13px] text-body">Phân trang thật (tổng theo kết quả lọc, chọn số dòng/trang) — xem trong ví dụ C025.</p>,
  C027: () => <p className="text-[13px] text-body">Chọn vài dòng ở C025 rồi chọn tất cả trên trang: thanh chọn phân biệt “trên trang này” và “tất cả kết quả lọc”.</p>,
  C028: () => <NeedPersona need={{ kind: "staff", userId: "u-hanh" }}><AccessKpis /></NeedPersona>,
  C029: () => <div className="flex flex-wrap gap-2">{["draft", "saved", "locked", "published", "pending", "superseded", "withdrawn", "revoked", "expired", "archived"].map((k) => <StatusBadge key={k} status={k} map={PUBLICATION_STATUS} />)}<StatusBadge status="unverified" map={verificationStatus} /></div>,
  C030: () => <div className="flex flex-wrap items-center gap-4"><Avatar name="Trần Thị Lan" tone="pink" size={42} /><Identity name="Nguyễn Minh Anh" sub="HS 10A1" tone="blue" /><SchoolMark name="Trường THPT Bình Minh" /><Avatar name="Lớp" tone="green" square /></div>,
  C031: () => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card><CardHeader title="Thẻ thông tin" icon={<Users className="size-5" />} action={<CardLink href={registryById("SC16")!.href} />} /><dl className="space-y-1 px-5 pb-4"><InfoRow label="Trường">THPT Bình Minh</InfoRow><InfoRow label="Năm học">2026–2027</InfoRow></dl></Card>
      <div className="space-y-3"><div className="flex gap-2">{(["blue", "green", "amber", "pink", "purple", "neutral"] as const).map((t) => <IconTile key={t} tone={t} size="sm"><School className="size-4" /></IconTile>)}</div><Callout tone="info" icon={<Info />} title="Callout thông tin">Dùng cho giải thích ngắn trong trang.</Callout><div className="panel-soft p-3 text-[13px]">Panel nền nhạt (panel-soft)</div></div>
    </div>
  ),
  C032: () => <NeedPersona need={{ kind: "staff", userId: "u-hanh" }}><TimelineExample /></NeedPersona>,
  C033: () => <ProgressExample />,
  C034: () => <NeedPersona need={{ kind: "staff", userId: "u-hanh" }}><AccessKpis chart /></NeedPersona>,
  C035: () => <NeedPersona need={{ kind: "staff", userId: "u-lan" }} why="Tệp lớp 10A1 đọc qua activitiesRepo.files (vai trò Cô Lan — GVCN 10A1)."><FileExample /></NeedPersona>,
  C036: () => <EmptyExample />,
};

export const DATA_LIVE = Object.keys(DATA_EXAMPLES);
