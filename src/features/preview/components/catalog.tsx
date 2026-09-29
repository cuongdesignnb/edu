"use client";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Palette, Keyboard, Smartphone, Component as ComponentIcon, Info, UserCog } from "lucide-react";
import { matches } from "@/lib/formatters";
import { useSession } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/data/table";
import { InlineSelect } from "@/components/ui/form";
import { EmptyFiltered } from "@/components/ui/states";
import { COMPONENTS, STATUS_META, progressOf, PERSONA_NAMES } from "../data";
import { LAYOUT_EXAMPLES, LAYOUT_LIVE } from "./ex-layout";
import { INPUT_EXAMPLES, INPUT_LIVE } from "./ex-inputs";
import { DATA_EXAMPLES, DATA_LIVE } from "./ex-data";
import { FEEDBACK_EXAMPLES, FEEDBACK_LIVE } from "./ex-feedback";
import { DOMAIN_EXAMPLES, DOMAIN_LIVE } from "./ex-domain";
import { UsedAt } from "./common";

const EXAMPLES: Record<string, () => ReactNode> = { ...LAYOUT_EXAMPLES, ...INPUT_EXAMPLES, ...DATA_EXAMPLES, ...FEEDBACK_EXAMPLES, ...DOMAIN_EXAMPLES };
/** IDs whose example on this page renders the real component interactively. */
export const LIVE_COMPONENT_IDS = [...LAYOUT_LIVE, ...INPUT_LIVE, ...DATA_LIVE, ...FEEDBACK_LIVE, ...DOMAIN_LIVE];
const LIVE = new Set(LIVE_COMPONENT_IDS);

const COLOR_TOKENS = [
  "primary", "primary-hover", "primary-strong", "primary-light", "primary-soft", "ink", "body", "muted", "faint", "app", "surface", "sidebar", "line", "line-strong",
  "success", "success-text", "success-bg", "warning", "warning-text", "warning-bg", "danger", "danger-text", "danger-bg", "purple", "purple-text", "purple-bg",
  "neutral-bg", "neutral-text", "pastel-blue", "pastel-green", "pastel-amber", "pastel-pink", "pastel-purple",
];
const TYPE_SCALE: { cls: string; label: string; sample: string }[] = [
  { cls: "page-title", label: ".page-title — 30px/800 (23px trên điện thoại)", sample: "Tổng quan nhà trường" },
  { cls: "page-subtitle", label: ".page-subtitle — 16px", sample: "Năm học 2026–2027 · dữ liệu minh họa" },
  { cls: "quote", label: ".quote — 17px nghiêng", sample: "“Mỗi ngày đến trường là một ngày vui”" },
  { cls: "section-title", label: ".section-title — 17px/700", sample: "Việc cần làm hôm nay" },
  { cls: "text-sm text-body", label: "Nội dung — 14px", sample: "Lớp 10A1 đã lưu điểm danh buổi sáng, chưa công bố." },
  { cls: "helper", label: ".helper — 12px", sample: "Ngày hiển thị dạng dd/MM/yyyy." },
  { cls: "eyebrow", label: ".eyebrow — 12px chữ hoa", sample: "Tiện ích" },
];
const SPACING = [4, 8, 12, 16, 20, 24, 32];
const RADII = ["radius-control", "radius-card", "radius-panel"];

function useCssVars(names: string[]) {
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setVals(Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()])));
  }, [names]);
  return vals;
}

function Tokens() {
  const colorNames = useMemo(() => COLOR_TOKENS.map((c) => `color-${c}`), []);
  const other = useMemo(() => [...RADII, "shadow-card", "shadow-pop", "font-sans"], []);
  const colors = useCssVars(colorNames);
  const misc = useCssVars(other);
  return (
    <Card id="tokens" className="scroll-mt-4">
      <CardHeader title="Token thiết kế" icon={<Palette className="size-5" />} subtitle="Đọc trực tiếp từ biến CSS của src/styles/globals.css — không có màu/font tự chế ở từng màn hình." />
      <div className="space-y-6 px-5 pb-5">
        <div>
          <h3 className="mb-2 text-[14px] font-bold text-ink">Màu</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
            {colorNames.map((n) => (
              <li key={n} className="overflow-hidden rounded-xl border border-line bg-white">
                <span className="block h-12" style={{ background: `var(--${n})` }} aria-hidden />
                <span className="block px-2 py-1.5"><code className="block truncate text-[11.5px] text-ink" title={`--${n}`}>--{n}</code><span className="text-[11.5px] text-muted">{colors[n] || "…"}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[14px] font-bold text-ink">Chữ ({misc["font-sans"]?.split(",")[0] || "Be Vietnam Pro"})</h3>
            <ul className="space-y-3">{TYPE_SCALE.map((t) => <li key={t.cls}><p className={t.cls}>{t.sample}</p><p className="text-[11.5px] text-muted">{t.label}</p></li>)}</ul>
          </div>
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-[14px] font-bold text-ink">Khoảng cách (thang Tailwind 4px)</h3>
              <ul className="space-y-1.5">{SPACING.map((s) => <li key={s} className="flex items-center gap-3 text-[12.5px]"><span className="w-12 text-muted">{s}px</span><span className="h-3 rounded bg-primary-soft" style={{ width: s * 4 }} aria-hidden /></li>)}</ul>
            </div>
            <div>
              <h3 className="mb-2 text-[14px] font-bold text-ink">Bo góc và đổ bóng</h3>
              <ul className="flex flex-wrap gap-3">
                {RADII.map((r) => <li key={r} className="flex size-24 flex-col items-center justify-center border border-line-strong bg-white text-center text-[11.5px]" style={{ borderRadius: `var(--${r})` }}><code>--{r}</code><span className="text-muted">{misc[r] || "chưa dùng — Tailwind không xuất biến"}</span></li>)}
                {["shadow-card", "shadow-pop"].map((s) => <li key={s} className="flex size-24 items-center justify-center rounded-[14px] bg-white text-center text-[11.5px]" style={{ boxShadow: `var(--${s})` }}><code>--{s}</code></li>)}
              </ul>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Callout tone="info" icon={<Keyboard />} title="Bàn phím">Mọi nút, menu, tab, hộp thoại dùng được bằng Tab / Shift+Tab / Enter / Space / Escape; focus hiện viền xanh 2px (:focus-visible). Hộp thoại giữ focus bên trong và trả focus về nút mở.</Callout>
          <Callout tone="info" icon={<Smartphone />} title="Điện thoại">Kiểm tra ở 390px: bảng cuộn trong khung (.table-wrap), drawer thành toàn màn hình, bottom sheet cho chọn nhanh, nút cảm ứng tối thiểu 44px (pointer: coarse). Body không tràn ngang.</Callout>
        </div>
      </div>
    </Card>
  );
}

function PersonaNote() {
  const { session, signIn } = useSession();
  const cur = session?.actor.kind === "staff" || session?.actor.kind === "platform" ? session.actor.userId : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-[13px]">
      <UserCog className="size-4 text-primary" aria-hidden />
      <span className="text-muted">Vai trò demo hiện tại:</span><b className="text-ink">{cur ? PERSONA_NAMES[cur] ?? cur : "chưa chọn"}</b>
      <span className="text-muted">— ví dụ đọc dữ liệu thật sẽ hiện nút đổi vai trò phù hợp.</span>
      <span className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" variant={cur === "u-hanh" ? "primary" : "secondary"} onClick={() => signIn({ kind: "staff", userId: "u-hanh" })}>Quản trị trường A</Button>
        <Button size="sm" variant={cur === "u-lan" ? "primary" : "secondary"} onClick={() => signIn({ kind: "staff", userId: "u-lan" })}>Cô Lan</Button>
        <Button size="sm" variant={cur === "u-bao" ? "primary" : "secondary"} onClick={() => signIn({ kind: "platform", userId: "u-bao" })}>Vận hành</Button>
      </span>
    </div>
  );
}

function Catalog() {
  const groups = [...new Set(COMPONENTS.map((c) => c.group))];
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [mode, setMode] = useState("");
  const list = COMPONENTS.filter((c) => matches(q, c.id, c.name, c.variants, c.acceptance) && (!group || c.group === group) && (!mode || (mode === "live" ? LIVE.has(c.id) : !LIVE.has(c.id))));
  const reset = () => { setQ(""); setGroup(""); setMode(""); };
  return (
    <div className="page">
      <PageHeader title="Thư viện component" subtitle={`${COMPONENTS.length} component (C001–C${String(COMPONENTS.length).padStart(3, "0")}) theo docs/02 — ${LIVE.size} có ví dụ chạy thật trên trang này, phần còn lại mở route đang dùng.`} />
      <Callout tone="info" icon={<Info />} title="Ví dụ dùng component thật">
        Mỗi ví dụ được dựng từ component dùng chung (src/components) hoặc component nghiệp vụ của nhóm sở hữu (src/features), với dữ liệu từ repository mock khi có ý nghĩa. Component cần ngữ cảnh lớp (ClassroomLayout) được mở tại route thật. Thao tác trong ví dụ có thể ghi dữ liệu demo thật — dùng “Đặt lại dữ liệu demo” ở trang chọn vai trò khi cần.
      </Callout>
      <PersonaNote />
      <Tokens />
      <Card>
        <FilterBar q={q} onQ={setQ} placeholder="Tìm theo mã, tên, biến thể…" active={!!q || !!group || !!mode} onReset={reset}>
          <InlineSelect label="Nhóm" value={group} onChange={setGroup} allLabel="Tất cả nhóm" options={groups.map((g) => ({ value: g, label: g }))} />
          <InlineSelect label="Kiểu ví dụ" value={mode} onChange={setMode} allLabel="Mọi kiểu" options={[{ value: "live", label: "Chạy trực tiếp" }, { value: "route", label: "Mở tại route" }]} />
        </FilterBar>
        <nav aria-label="Nhóm component" className="flex flex-wrap gap-2 px-5 pb-4">{groups.map((g) => <a key={g} href={`#g-${groups.indexOf(g)}`} className="chip hover:bg-primary-light">{g}</a>)}</nav>
      </Card>
      {!list.length && <Card><EmptyFiltered onReset={reset} what="component" /></Card>}
      {groups.map((g, gi) => {
        const items = list.filter((c) => c.group === g);
        if (!items.length) return null;
        return (
          <Card key={g} id={`g-${gi}`} className="scroll-mt-4">
            <CardHeader title={`${g} (${items.length})`} icon={<ComponentIcon className="size-5" />} />
            <ul className="space-y-4 px-5 pb-5">
              {items.map((c) => {
                const p = progressOf("components", c.id);
                return (
                  <li key={c.id} id={c.id} className="scroll-mt-4 rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info" dot={false}>{c.id}</Badge>
                      <h3 className="font-mono text-[15px] font-bold text-ink">{c.name}</h3>
                      {LIVE.has(c.id) ? <Badge tone="success">Chạy trực tiếp</Badge> : <Badge tone="neutral">Mở tại route</Badge>}
                      <Badge tone={STATUS_META[p.status].tone} className="ml-auto">Tiến độ: {STATUS_META[p.status].label}</Badge>
                    </div>
                    <p className="mt-1.5 text-[13px] text-body"><b className="text-ink">Biến thể:</b> {c.variants}</p>
                    <p className="text-[13px] text-body"><b className="text-ink">Nghiệm thu:</b> {c.acceptance}</p>
                    <div className="mt-3 min-w-0">{EXAMPLES[c.id]?.() ?? null}</div>
                    <div className="mt-2"><UsedAt id={c.id} /></div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

export function ComponentCatalog() {
  return <Suspense fallback={null}><Catalog /></Suspense>;
}
