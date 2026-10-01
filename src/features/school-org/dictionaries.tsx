"use client";
import { useMemo, useState } from "react";
import { BookOpen, Layers, DoorOpen, Plus, Pencil, Ban, RotateCcw, Info } from "lucide-react";
import { schoolRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { ErrorSummary, InlineSelect, NumberField, TextField } from "@/components/ui/form";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { DataTable, FilterBar, Pagination, type Column } from "@/components/data/table";
import { EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { matches } from "@/lib/formatters";
import { FormError, useDirtyClose, useFormErrors } from "./common";

type Kind = "grade" | "subject" | "room";
type Dict = Awaited<ReturnType<typeof schoolRepo.dictionaries>>;
type Item = Dict["grades"][number];
const KIND_LABEL: Record<Kind, string> = { grade: "khối", subject: "môn học", room: "phòng học" };

/** SC08 — dictionaries: grades / subjects / rooms. Add, edit, deactivate; items in use are never deleted. */
export function DictionariesScreen() {
  const { school } = useSchool();
  const q = useRepo(["school-dictionaries", school.id], (c) => schoolRepo.dictionaries(c, school.id));
  return (
    <div className="page">
      <PageHeader title="Danh mục khối, môn, phòng" subtitle="Danh mục dùng chung cho lớp, phân công và lịch học của trường"
        breadcrumbs={[{ label: "Nhà trường", href: `/school/${school.id}` }, { label: "Danh mục" }]} />
      <QueryState query={q} skeleton="table">
        {(d) => (
          <>
            <Callout tone="info" icon={<Info />}>Mục đã được dùng (lớp, phân công, lịch) không thể xóa để giữ lịch sử — chỉ “Ngừng dùng”. Mục ngừng dùng không xuất hiện khi tạo lớp hoặc phân công mới.</Callout>
            <Tabs tabs={[
              { value: "grade", label: "Khối lớp", icon: <Layers />, count: d.grades.length },
              { value: "subject", label: "Môn học", icon: <BookOpen />, count: d.subjects.length },
              { value: "room", label: "Phòng học", icon: <DoorOpen />, count: d.rooms.length },
            ]}>
              <TabPanel value="grade"><DictTable kind="grade" rows={d.grades} canManage={d.canManage} /></TabPanel>
              <TabPanel value="subject"><DictTable kind="subject" rows={d.subjects} canManage={d.canManage} /></TabPanel>
              <TabPanel value="room"><DictTable kind="room" rows={d.rooms} canManage={d.canManage} /></TabPanel>
            </Tabs>
          </>
        )}
      </QueryState>
    </div>
  );
}

function DictTable({ kind, rows, canManage }: { kind: Kind; rows: Item[]; canManage: boolean }) {
  const { school } = useSchool();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Item | "new" | null>(null);
  const [toggle, setToggle] = useState<Item | null>(null);
  const cmd = useCommand((c, row: Item, st: "active" | "inactive") => schoolRepo.setDictionaryStatus(c, school.id, kind, row.id, st, row.version), { success: (x) => x.status === "inactive" ? `Đã ngừng dùng ${x.name}` : `Đã dùng lại ${x.name}` });
  const filtered = useMemo(() => rows.filter((r) => matches(q, r.name, r.code) && (!status || r.status === status)).sort((a, b) => kind === "grade" ? (a.level ?? 0) - (b.level ?? 0) : a.name.localeCompare(b.name, "vi")), [rows, q, status, kind]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const columns: Column<Item>[] = [
    ...(kind === "grade" ? [{ key: "level", header: "Cấp khối", cell: (r: Item) => <span className="font-semibold text-ink">{r.level}</span> }] : [{ key: "code", header: "Mã", cell: (r: Item) => <span className="font-mono text-[13px] font-semibold text-ink">{r.code}</span> }]),
    { key: "name", header: "Tên", cell: (r) => <span className="flex items-center gap-2">{kind === "subject" && <span className="size-3 flex-none rounded-full" style={{ background: r.color }} aria-hidden />}<span className="font-medium text-ink">{r.name}</span></span> },
    ...(kind === "room" ? [{ key: "cap", header: "Sức chứa", align: "right" as const, cell: (r: Item) => r.capacity }] : []),
    { key: "use", header: "Sử dụng", cell: (r) => r.inUse ? <Badge tone="info" dot={false}>Đang có dữ liệu liên quan</Badge> : <span className="text-[13px] text-muted">Chưa dùng</span> },
    { key: "status", header: "Trạng thái", cell: (r) => r.status === "active" ? <Badge tone="success">Đang dùng</Badge> : <Badge tone="neutral">Ngừng dùng</Badge> },
    ...(canManage ? [{ key: "act", header: <span className="sr-only">Thao tác</span>, align: "center" as const, cell: (r: Item) => <ActionMenu label={`Thao tác với ${r.name}`} items={[
      { label: "Sửa", icon: <Pencil />, onSelect: () => setEdit(r) },
      r.status === "active" ? { label: "Ngừng dùng", icon: <Ban />, danger: true, separatorBefore: true, onSelect: () => setToggle(r) } : { label: "Dùng lại", icon: <RotateCcw />, separatorBefore: true, onSelect: () => setToggle(r) },
    ]} /> }] : []),
  ];
  return (
    <Card>
      <FilterBar q={q} onQ={(v) => { setQ(v); setPage(1); }} placeholder={`Tìm ${KIND_LABEL[kind]} theo tên${kind === "grade" ? "" : ", mã"}…`} active={!!q || !!status} onReset={() => { setQ(""); setStatus(""); }}>
        <InlineSelect label="Trạng thái" allLabel="Tất cả trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "active", label: "Đang dùng" }, { value: "inactive", label: "Ngừng dùng" }]} />
        {canManage && <Button variant="primary" icon={<Plus className="size-4" />} className="!flex-none" onClick={() => setEdit("new")}>Thêm {KIND_LABEL[kind]}</Button>}
      </FilterBar>
      <div className="px-4">
        <DataTable caption={`Danh mục ${KIND_LABEL[kind]}`} rows={filtered.slice((cur - 1) * pageSize, cur * pageSize)} columns={columns} rowKey={(r) => r.id} minWidth={520}
          empty={rows.length === 0 ? <EmptyState compact title={`Chưa có ${KIND_LABEL[kind]}`} action={canManage ? <Button size="sm" variant="primary" onClick={() => setEdit("new")}>Thêm {KIND_LABEL[kind]}</Button> : undefined} /> : <EmptyFiltered onReset={() => { setQ(""); setStatus(""); }} what={KIND_LABEL[kind]} />} />
      </div>
      <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} what={KIND_LABEL[kind]} />
      <ItemDialog kind={kind} item={edit} onClose={() => setEdit(null)} />
      <ConfirmDialog open={!!toggle} onOpenChange={(o) => { if (!o) setToggle(null); }} busy={cmd.pending} error={cmd.error?.message} object={toggle?.name}
        title={toggle?.status === "active" ? `Ngừng dùng ${KIND_LABEL[kind]}` : `Dùng lại ${KIND_LABEL[kind]}`} variant={toggle?.status === "active" ? "danger" : "primary"} confirmLabel={toggle?.status === "active" ? "Ngừng dùng" : "Dùng lại"}
        consequence={toggle?.status === "active" ? `Không chọn được khi tạo lớp/phân công/lịch mới. ${toggle?.inUse ? "Dữ liệu cũ đang dùng mục này vẫn giữ nguyên." : ""}` : "Mục xuất hiện lại trong các lựa chọn."}
        onConfirm={async () => { if (!toggle) return; const r = await cmd.run(toggle, toggle.status === "active" ? "inactive" : "active"); if (r) setToggle(null); }} />
    </Card>
  );
}

function ItemDialog({ kind, item, onClose }: { kind: Kind; item: Item | "new" | null; onClose: () => void }) {
  const { school } = useSchool();
  const cur = item && item !== "new" ? item : null;
  const init = { name: cur?.name ?? "", code: cur?.code ?? "", level: cur?.level ?? undefined, color: cur?.color ?? "#0a72e6", capacity: (cur?.capacity ?? 40) as number | undefined };
  const [v, setV] = useState(init);
  const [key, setKey] = useState<unknown>(null);
  if (key !== item) { setKey(item); setV(init); }
  const { errors, setErrors, onError, clear } = useFormErrors();
  const dirty = !!item && JSON.stringify(v) !== JSON.stringify(init);
  const close = () => { setErrors({}); onClose(); };
  const { beforeClose, confirmNode } = useDirtyClose(dirty, close);
  const cmd = useCommand((c, payload: Parameters<typeof schoolRepo.saveDictionaryItem>[3]) => schoolRepo.saveDictionaryItem(c, school.id, kind, payload), { success: (x) => cur ? `Đã cập nhật ${x.name}` : `Đã thêm ${x.name}`, onError });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: val })); clear(k as string); };
  const submit = async () => {
    const e: Record<string, string> = {};
    if (v.name.trim().length < 2) e.name = "Tên tối thiểu 2 ký tự";
    if (kind === "grade" && (!v.level || v.level < 1 || v.level > 12)) e.level = "Khối từ 1 đến 12";
    if (kind !== "grade" && !v.code.trim()) e.code = "Nhập mã";
    if (kind === "room" && !v.capacity) e.capacity = "Nhập sức chứa";
    if (Object.keys(e).length) { setErrors(e); return; }
    const payload = { id: cur?.id, version: cur?.version, name: v.name.trim(), ...(kind === "grade" ? { level: v.level } : { code: v.code.trim().toUpperCase() }), ...(kind === "subject" ? { color: v.color } : {}), ...(kind === "room" ? { capacity: v.capacity } : {}) };
    const r = await cmd.run(payload);
    if (r) close();
  };
  return (
    <>
      <Modal open={!!item} onOpenChange={(o) => { if (!o) close(); }} beforeClose={beforeClose} busy={cmd.pending} size="sm" title={cur ? `Sửa ${KIND_LABEL[kind]}` : `Thêm ${KIND_LABEL[kind]}`}
        footer={<><Button variant="ghost" onClick={() => { if (beforeClose()) close(); }} disabled={cmd.pending}>Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit}>{cur ? "Lưu" : "Thêm"}</Button></>}>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <ErrorSummary errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k !== "_form"))} labels={{ name: "Tên", code: "Mã", level: "Cấp khối", capacity: "Sức chứa" }} />
          <FormError message={errors._form} />
          {kind === "grade" ? <div data-field="level"><NumberField label="Cấp khối" required min={1} max={12} allowNegative={false} value={v.level} onChange={(n) => { set("level", n); if (n && !v.name) set("name", `Khối ${n}`); }} error={errors.level} /></div>
            : <div data-field="code"><TextField label="Mã" required value={v.code} onChange={(e) => set("code", e.target.value)} error={errors.code} helper="Duy nhất trong trường; tự viết hoa." /></div>}
          <div data-field="name"><TextField label="Tên" required value={v.name} onChange={(e) => set("name", e.target.value)} error={errors.name} /></div>
          {kind === "subject" && <label className="field"><span className="label">Màu hiển thị trên lịch</span><span className="flex items-center gap-3"><input type="color" value={v.color} onChange={(e) => set("color", e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line" aria-label="Chọn màu môn học" /><span className="font-mono text-sm text-body">{v.color}</span></span></label>}
          {kind === "room" && <div data-field="capacity"><NumberField label="Sức chứa" required min={1} max={200} allowNegative={false} value={v.capacity} onChange={(n) => set("capacity", n)} error={errors.capacity} /></div>}
          {cur?.inUse && <Callout tone="neutral">Mục đang có dữ liệu liên quan; đổi tên sẽ hiển thị ở mọi nơi dùng mục này.</Callout>}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>
      {confirmNode}
    </>
  );
}

export type { Dict };
