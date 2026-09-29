"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListChecks, LayoutGrid, Component, PanelsTopLeft, Activity, CheckCircle2, CircleDashed, Plug, Info, FileImage } from "lucide-react";
import { fmtDateTime, matches } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, InlineSelect } from "@/components/ui/form";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { EmptyFiltered } from "@/components/ui/states";
import { ProgressBar } from "@/components/ui/progress";
import { KpiCard } from "@/components/data/kpi";
import { DataTable, FilterBar, Pagination, type Column } from "@/components/data/table";
import {
  AREAS, BASIS_LABEL, COMPONENTS, OVERLAYS, SCOPE_LABEL, SCREENS, STATES, STATUS_META, STATUS_ORDER, PROGRESS_GENERATED_AT,
  areaOf, isBuilt, isConnected, isQa, progressOf, type Kind, type ProgressItem, type Status,
} from "./data";
import { OpenButton } from "./open";

interface Row { id: string; title: string; group: string; scope?: "core" | "internal" | "optional"; basis?: "reference" | "derived"; detail: string; p: ProgressItem; href?: string; entry?: (typeof SCREENS)[number] }

function rowsOf(kind: Kind): Row[] {
  if (kind === "screens") return SCREENS.map((e) => ({ id: e.id, title: e.title, group: areaOf(e).label, scope: e.scope, basis: e.basis, detail: e.route, p: progressOf("screens", e.id), href: e.href, entry: e }));
  if (kind === "components") return COMPONENTS.map((c) => ({ id: c.id, title: c.name, group: c.group, detail: `${c.variants} — ${c.acceptance}`, p: progressOf("components", c.id) }));
  if (kind === "overlays") return OVERLAYS.map((o) => ({ id: o.id, title: o.title, group: "Overlay / form", detail: `${o.fields} — ${o.acceptance}`, p: progressOf("overlays", o.id) }));
  return STATES.map((s) => ({ id: s.id, title: s.title, group: "Trạng thái", detail: s.acceptance, p: progressOf("states", s.id) }));
}

function useEvidenceIndex() {
  const [files, setFiles] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/preview-references/evidence-index.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { files: [] })).then((j: { files?: string[] }) => { if (alive) setFiles(new Set(j.files ?? [])); }).catch(() => { if (alive) setFiles(new Set()); });
    return () => { alive = false; };
  }, []);
  return files;
}

function Evidence({ list, mirrored }: { list: string[]; mirrored: Set<string> | null }) {
  if (!list.length) return <span className="text-[12.5px] text-faint">Chưa có</span>;
  return (
    <ul className="flex flex-col gap-0.5">
      {list.map((e) => {
        const name = e.split("/").pop() ?? e;
        return (
          <li key={e} className="text-[12.5px]">
            {mirrored?.has(name)
              ? <a href={`/preview-references/evidence/${name}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary-strong hover:underline"><FileImage className="size-3.5" aria-hidden />{name}</a>
              : <span className="text-muted" title="Chưa đồng bộ ảnh — chạy node scripts/copy-references.mjs">{name}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Kpis({ kind }: { kind: Kind }) {
  const rows = rowsOf(kind);
  const base = kind === "screens" ? rows.filter((r) => r.scope !== "optional") : rows;
  const c = (pred: (s: Status) => boolean, list = base) => list.filter((r) => pred(r.p.status)).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={kind === "screens" ? "Tổng (lõi + nội bộ)" : "Tổng"} value={base.length} icon={<ListChecks className="size-6" />} tone="blue" hint={kind === "screens" ? `Không tính ${rows.length - base.length} mục mở rộng tắt mặc định` : "Theo manifest"} />
        <KpiCard label="Đã nối mock trở lên" value={c(isConnected)} icon={<Plug className="size-6" />} tone="purple" hint={`${base.length ? Math.round((c(isConnected) / base.length) * 100) : 0}% — trạng thái có bằng chứng`} />
        <KpiCard label="Đã QA (ảnh chụp/E2E)" value={c(isQa)} icon={<CheckCircle2 className="size-6" />} tone="green" hint="Chỉ tính khi nhóm ghi kèm ảnh chụp" />
        <KpiCard label="Chưa làm" value={c((s) => s === "not_started")} icon={<CircleDashed className="size-6" />} tone="neutral" hint="Mục không có trong tiến độ = chưa làm" />
      </div>
      {kind === "screens" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(["core", "internal", "optional"] as const).map((scope) => {
            const list = rows.filter((r) => r.scope === scope);
            return (
              <div key={scope} className="panel-soft p-4">
                <p className="text-[13.5px] font-bold text-ink">{SCOPE_LABEL[scope]} — {list.length} màn hình</p>
                {scope === "optional" ? <p className="mt-1 text-[12.5px] text-muted">Tắt mặc định (ENABLE_ACADEMIC_RESULTS_PREVIEW=false), không cộng vào tổng lõi.</p> : (
                  <div className="mt-2 space-y-2">
                    <ProgressBar value={c(isConnected, list)} total={list.length} label={`Đã nối mock: ${c(isConnected, list)}/${list.length}`} />
                    <ProgressBar value={c(isQa, list)} total={list.length} color="var(--color-success)" label={`Đã QA: ${c(isQa, list)}/${list.length}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KindTable({ kind }: { kind: Kind }) {
  const all = useMemo(() => rowsOf(kind), [kind]);
  const mirrored = useEvidenceIndex();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const [derivedOnly, setDerivedOnly] = useState(false);
  const [notBuilt, setNotBuilt] = useState(false);
  const [notQa, setNotQa] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const groups = [...new Set(all.map((r) => r.group))];
  const filtered = all.filter((r) => matches(q, r.id, r.title, r.detail, r.p.notes)
    && (!group || r.group === group) && (!status || r.p.status === status)
    && (!derivedOnly || r.basis === "derived") && (!notBuilt || !isBuilt(r.p.status)) && (!notQa || !isQa(r.p.status)));
  const active = !!q || !!group || !!status || derivedOnly || notBuilt || notQa;
  const reset = () => { setQ(""); setGroup(""); setStatus(""); setDerivedOnly(false); setNotBuilt(false); setNotQa(false); setPage(1); };
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const items = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const f = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const cols: Column<Row>[] = [
    { key: "id", header: "ID", cell: (r) => <span className="font-mono text-[12.5px] font-bold text-primary-strong">{r.id}</span> },
    { key: "title", header: "Tên", cell: (r) => (
      <div className="min-w-[200px]"><p className="font-semibold text-ink">{r.title}</p><p className="line-clamp-2 text-[12px] text-muted">{r.detail}</p></div>
    ) },
    { key: "group", header: kind === "screens" ? "Khu vực" : "Nhóm", cell: (r) => <span className="text-[13px]">{r.group}</span>, hideBelow: "md" },
    ...(kind === "screens" ? [{ key: "scope", header: "Phạm vi / cơ sở", hideBelow: "lg" as const, cell: (r: Row) => (
      <div className="flex flex-col items-start gap-1"><Badge tone={r.scope === "core" ? "success" : r.scope === "internal" ? "warning" : "neutral"} dot={false}>{SCOPE_LABEL[r.scope!]}</Badge><span className="text-[12px] text-muted">{BASIS_LABEL[r.basis!]}</span></div>
    ) }] : []),
    { key: "status", header: "Trạng thái", cell: (r) => r.scope === "optional" ? <Badge tone="neutral">Tắt mặc định</Badge> : <Badge tone={STATUS_META[r.p.status].tone}>{STATUS_META[r.p.status].label}</Badge> },
    { key: "evidence", header: "Bằng chứng / nơi dùng", cell: (r) => (
      <div className="flex flex-col gap-1">
        {r.p.route && <Link href={r.p.route} className="font-mono text-[12px] font-semibold text-primary-strong hover:underline">{r.p.route}</Link>}
        <Evidence list={r.p.evidence} mirrored={mirrored} />
        {r.p.notes && <p className="line-clamp-3 max-w-[320px] text-[12px] text-muted" title={r.p.notes}>{r.p.notes}</p>}
      </div>
    ) },
    ...(kind === "screens" ? [{ key: "open", header: "", align: "right" as const, cell: (r: Row) => r.scope === "optional" || !r.entry ? null : <OpenButton persona={r.entry.persona} href={r.entry.href} /> }] : []),
  ];

  return (
    <Card>
      <FilterBar q={q} onQ={f(setQ)} placeholder="Tìm theo ID, tên, ghi chú…" active={active} onReset={reset}>
        <InlineSelect label={kind === "screens" ? "Khu vực" : "Nhóm"} value={group} onChange={f(setGroup)} allLabel="Tất cả" options={(kind === "screens" ? AREAS.map((a) => a.label) : groups).map((g) => ({ value: g, label: g }))} />
        <InlineSelect label="Trạng thái" value={status} onChange={f(setStatus)} allLabel="Mọi trạng thái" options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
      </FilterBar>
      <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 pb-3">
        {kind === "screens" && <Checkbox label="Chưa có ảnh riêng (derived)" checked={derivedOnly} onChange={f(setDerivedOnly)} />}
        <Checkbox label="Chưa dựng" checked={notBuilt} onChange={f(setNotBuilt)} />
        <Checkbox label="Chưa QA" checked={notQa} onChange={f(setNotQa)} />
      </div>
      <DataTable rows={items} columns={cols} rowKey={(r) => r.id} caption={`Checklist ${kind}`} minWidth={kind === "screens" ? 980 : 760} dense
        empty={active ? <EmptyFiltered onReset={reset} what="mục" /> : <p className="p-6 text-center text-muted">Manifest trống.</p>} />
      <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} what="mục" />
    </Card>
  );
}

const TABS: { value: Kind; label: string; icon: React.ReactNode; count: number }[] = [
  { value: "screens", label: "Màn hình", icon: <LayoutGrid />, count: SCREENS.length },
  { value: "components", label: "Component", icon: <Component />, count: COMPONENTS.length },
  { value: "overlays", label: "Overlay / form", icon: <PanelsTopLeft />, count: OVERLAYS.length },
  { value: "states", label: "Trạng thái", icon: <Activity />, count: STATES.length },
];

function Checklist() {
  return (
    <div className="page">
      <PageHeader title="Checklist giao diện" subtitle={`${SCREENS.length} màn hình · ${COMPONENTS.length} component · ${OVERLAYS.length} overlay/form · ${STATES.length} trạng thái — số liệu tính từ registry và tiến độ có bằng chứng.`} />
      <Callout tone="info" icon={<Info />} title="Nguồn số liệu">
        Tiến độ đọc từ src/generated/progress.json (sinh bởi scripts/gen-progress.mjs từ qa/status/*.json lúc {fmtDateTime(PROGRESS_GENERATED_AT)}).
        Mục không có bằng chứng giữ “Chưa làm”. Không dùng các con số hay dấu “Done” minh họa trong ảnh bảng checklist.
      </Callout>
      <Tabs tabs={TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon, count: t.count }))} param="loai">
        {TABS.map((t) => (
          <TabPanel key={t.value} value={t.value} className="space-y-4">
            <Kpis kind={t.value} />
            <KindTable kind={t.value} />
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}


export function ChecklistView() {
  return <Suspense fallback={null}><Checklist /></Suspense>;
}

