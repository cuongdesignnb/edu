"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Network, List, FolderTree, Info, Ban } from "lucide-react";
import { clsx } from "clsx";
import { matches } from "@/lib/formatters";
import type { RegistryEntry } from "@/lib/routing/registry";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyFiltered } from "@/components/ui/states";
import { InlineSelect } from "@/components/ui/form";
import { FilterBar } from "@/components/data/table";
import { AREAS, BASIS_LABEL, SCOPE_LABEL, SCREENS, STATUS_META, STATUS_ORDER, areaOf, buildTree, personaLabel, progressOf, isConnected, type TreeNode } from "./data";
import { OpenButton } from "./open";

export function SitemapView() {
  return <Suspense fallback={null}><Sitemap /></Suspense>;
}

function StatusBadge({ id }: { id: string }) {
  const p = progressOf("screens", id);
  return <Badge tone={STATUS_META[p.status].tone}>{STATUS_META[p.status].label}</Badge>;
}

function NodeRow({ e, depth }: { e: RegistryEntry; depth: number }) {
  const optional = e.scope === "optional";
  return (
    <div className={clsx("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-white px-3 py-2.5", optional && "bg-[#f7f9fc]")} style={{ marginLeft: Math.min(depth, 4) * 18 }}>
      <span className="w-12 flex-none font-mono text-[12.5px] font-bold text-primary-strong">{e.id}</span>
      <div className="min-w-0 flex-[1_1_220px]">
        <p className="text-[14px] font-semibold text-ink">{e.title}</p>
        <p className="truncate font-mono text-[12px] text-muted" title={e.route}>{e.route}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={e.basis === "reference" ? "info" : "neutral"} dot={false}>{BASIS_LABEL[e.basis]}{e.refs.length ? ` · ${e.refs.join(", ")}` : ""}</Badge>
        <Badge tone={e.scope === "core" ? "success" : e.scope === "internal" ? "warning" : "neutral"} dot={false}>{SCOPE_LABEL[e.scope]}</Badge>
        {optional ? <Badge tone="neutral" icon={<Ban className="size-3.5" />}>Tắt mặc định</Badge> : <StatusBadge id={e.id} />}
      </div>
      <span className="hidden min-w-[180px] text-[12.5px] text-muted lg:inline">{personaLabel(e)}</span>
      <div className="ml-auto">
        {optional ? <span className="text-[12.5px] text-muted">Không có liên kết</span> : <OpenButton persona={e.persona} href={e.href} />}
      </div>
    </div>
  );
}

function Tree({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  return (
    <ul className="space-y-2">
      {nodes.map((n) => (
        <li key={n.entry.id} className="space-y-2">
          <NodeRow e={n.entry} depth={depth} />
          {n.children.length > 0 && <Tree nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function Sitemap() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [view, setView] = useState<"tree" | "list">("tree");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const active = !!q || !!area || !!status;
  const filtered = useMemo(() => SCREENS.filter((e) => matches(q, e.id, e.title, e.route, e.layout)
    && (!area || areaOf(e).key === area) && (!status || progressOf("screens", e.id).status === status)), [q, area, status]);
  const reset = () => { setQ(""); setArea(""); setStatus(""); };
  const byArea = AREAS.map((a) => ({ a, items: filtered.filter((e) => areaOf(e).key === a.key) })).filter((x) => x.items.length);
  const connected = SCREENS.filter((e) => e.scope !== "optional" && isConnected(progressOf("screens", e.id).status)).length;

  return (
    <div className="page">
      <PageHeader title="Sitemap triển khai" subtitle={`Cây route sinh tự động từ registry (${SCREENS.length} ID, ${AREAS.length} khu vực). Trạng thái lấy từ tiến độ có bằng chứng: ${connected}/${SCREENS.filter((e) => e.scope !== "optional").length} màn hình (không tính mở rộng) đã nối mock trở lên.`} />
      <Callout tone="info" icon={<Info />} title="Nút “Mở” đổi vai trò demo trước khi mở">
        Màn hình nền tảng mở bằng vai trò vận hành, màn hình nhà trường bằng Quản trị trường A, lớp/giáo viên bằng Cô Lan. Màn hình phụ huynh mở trong tab mới bằng link demo của mẹ Minh Anh (không có tài khoản phụ huynh). Tham số route được thay bằng dữ liệu mẫu hợp lệ. EX01–EX03 tắt mặc định nên không có liên kết.
      </Callout>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-9">
        {AREAS.map((a) => {
          const all = SCREENS.filter((e) => areaOf(e).key === a.key);
          const done = all.filter((e) => isConnected(progressOf("screens", e.id).status)).length;
          return (
            <button key={a.key} type="button" onClick={() => setArea(area === a.key ? "" : a.key)} aria-pressed={area === a.key}
              className={clsx("card flex flex-col items-start gap-1 p-3 text-left transition-colors hover:border-[#9cc7f5]", area === a.key && "border-primary bg-primary-light")}>
              <IconTile tone={a.tone} size="sm"><FolderTree className="size-4" /></IconTile>
              <span className="text-[13px] font-bold leading-tight text-ink">{a.label}</span>
              <span className="text-[12px] text-muted">{all.length} ID · {a.key === "optional" ? "tắt" : `${done} đã nối`}</span>
            </button>
          );
        })}
      </div>
      <Card>
        <CardHeader title="Sơ đồ route" icon={<Network className="size-5" />} action={
          <div className="flex gap-1 rounded-xl bg-neutral-bg p-1" role="group" aria-label="Kiểu hiển thị">
            <button type="button" className={clsx("btn btn-sm", view === "tree" ? "btn-primary" : "btn-ghost")} aria-pressed={view === "tree"} onClick={() => setView("tree")}><FolderTree className="size-4" aria-hidden />Dạng cây</button>
            <button type="button" className={clsx("btn btn-sm", view === "list" ? "btn-primary" : "btn-ghost")} aria-pressed={view === "list"} onClick={() => setView("list")}><List className="size-4" aria-hidden />Dạng danh sách</button>
          </div>
        } />
        <FilterBar q={q} onQ={setQ} placeholder="Tìm theo ID, tên, route…" active={active} onReset={reset}>
          <InlineSelect label="Khu vực" value={area} onChange={setArea} allLabel="Tất cả khu vực" options={AREAS.map((a) => ({ value: a.key, label: a.label }))} />
          <InlineSelect label="Trạng thái" value={status} onChange={setStatus} allLabel="Mọi trạng thái" options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
        </FilterBar>
        <p className="px-5 pb-2 text-[12.5px] text-muted" aria-live="polite">Hiển thị {filtered.length}/{SCREENS.length} ID</p>
        <div className="space-y-6 px-4 pb-5 sm:px-5">
          {!filtered.length && <EmptyFiltered onReset={reset} what="màn hình" />}
          {byArea.map(({ a, items }) => (
            <section key={a.key} aria-labelledby={`area-${a.key}`}>
              <h2 id={`area-${a.key}`} className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
                <IconTile tone={a.tone} size="sm"><FolderTree className="size-4" /></IconTile>{a.label}<span className="text-[13px] font-medium text-muted">({items.length})</span>
              </h2>
              {view === "tree" ? <Tree nodes={buildTree(items)} depth={0} /> : (
                <ul className="space-y-2">{items.map((e) => <li key={e.id}><NodeRow e={e} depth={0} /></li>)}</ul>
              )}
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
