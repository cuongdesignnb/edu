"use client";
import { useEffect, useState } from "react";
import { Route, Target, Users, CheckCircle2, Info, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { ProgressBar } from "@/components/ui/progress";
import { FLOWS } from "./flow-defs";
import { OpenButton } from "./open";
import { PERSONA_NAMES } from "./data";

const KEY = "edumanage-preview-flows-tried";

function useTried() {
  const [tried, setTried] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setTried(JSON.parse(window.localStorage.getItem(KEY) ?? "{}")); } catch { setTried({}); }
  }, []);
  const set = (k: string, v: boolean) => setTried((t) => {
    const next = { ...t, [k]: v };
    if (!v) delete next[k];
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const clear = () => { setTried({}); try { window.localStorage.removeItem(KEY); } catch { /* ignore */ } };
  return { tried, set, clear };
}

function personaText(p: (typeof FLOWS)[number]["steps"][number]["persona"]) {
  if (p.kind === "platform") return "Vận hành nền tảng";
  if (p.kind === "staff") return PERSONA_NAMES[p.userId] ?? p.userId;
  if (p.kind === "parent") return `Link phụ huynh (${p.token})`;
  return "Không đổi vai trò";
}

/** DV07 — F01–F12 walkthroughs on the same seed and mock repository. */
export function FlowsView() {
  const { tried, set, clear } = useTried();
  const totalSteps = FLOWS.reduce((a, f) => a + f.steps.length, 0);
  const done = Object.values(tried).filter(Boolean).length;
  return (
    <div className="page">
      <PageHeader title="Các luồng nghiệp vụ demo" subtitle={`${FLOWS.length} luồng, ${totalSteps} bước. Mỗi bước đổi vai trò demo rồi mở đúng route với dữ liệu mẫu.`} />
      <Callout tone="info" icon={<Info />} title="Ô “Đã thử” chỉ là ghi chú cá nhân">
        Đánh dấu lưu trong trình duyệt này (localStorage) để bạn tự theo dõi — <b>không phải kết quả kiểm thử tự động</b> và không được tính vào tiến độ. Muốn quay lại dữ liệu ban đầu, dùng “Đặt lại dữ liệu demo” ở trang chọn vai trò.
      </Callout>
      <div className="card card-pad flex flex-wrap items-center gap-3"><ProgressBar className="flex-[1_1_240px]" value={done} total={totalSteps} label={`Bạn đã đánh dấu thử ${done}/${totalSteps} bước`} /><Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={clear} disabled={!done}>Bỏ đánh dấu tất cả</Button></div>
      <nav aria-label="Danh sách luồng" className="flex flex-wrap gap-2">
        {FLOWS.map((f) => <a key={f.id} href={`#${f.id}`} className={clsx("chip hover:bg-primary-light", f.highlight && "chip-active")}>{f.id} · {f.title}</a>)}
      </nav>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {FLOWS.map((f) => {
          const n = f.steps.filter((_, i) => tried[`${f.id}-${i}`]).length;
          return (
            <Card key={f.id} id={f.id} className="scroll-mt-4">
              <CardHeader title={<span className="flex flex-wrap items-center gap-2"><Badge tone={f.highlight ? "info" : "neutral"} dot={false}>{f.id}</Badge>{f.title}</span>} icon={<Route className="size-5" />}
                action={<Badge tone={n === f.steps.length ? "success" : "neutral"}>{n}/{f.steps.length} đã thử</Badge>} />
              <div className="space-y-4 px-5 pb-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex gap-2.5"><IconTile tone="blue" size="sm"><Target className="size-4" /></IconTile><div><p className="text-[12.5px] font-semibold text-muted">Mục tiêu</p><p className="text-[13.5px] text-ink">{f.goal}</p></div></div>
                  <div className="flex gap-2.5"><IconTile tone="purple" size="sm"><Users className="size-4" /></IconTile><div><p className="text-[12.5px] font-semibold text-muted">Vai trò tham gia</p><p className="text-[13.5px] text-ink">{f.personas.join(" · ")}</p></div></div>
                </div>
                <ol className="space-y-2.5">
                  {f.steps.map((s, i) => {
                    const k = `${f.id}-${i}`;
                    return (
                      <li key={k} className={clsx("rounded-xl border p-3", tried[k] ? "border-[#bfe8d6] bg-success-bg/40" : "border-line bg-white")}>
                        <div className="flex flex-wrap items-start gap-3">
                          <span className="flex size-7 flex-none items-center justify-center rounded-full bg-primary-light text-[13px] font-bold text-primary-strong">{i + 1}</span>
                          <div className="min-w-0 flex-[1_1_220px]">
                            <p className="text-[14px] font-semibold text-ink">{s.text}</p>
                            <p className="mt-0.5 text-[12.5px] text-muted">{personaText(s.persona)}{s.screenId ? ` · ${s.screenId}` : ""} · <span className="break-all font-mono">{s.href}</span></p>
                            <p className="mt-1 text-[13px] text-body"><b className="text-ink">Kỳ vọng:</b> {s.expect}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
                            <OpenButton persona={s.persona} href={s.href} label={s.newTab ? "Mở tab mới" : "Mở bước này"} />
                            <Checkbox label="Đã thử" checked={!!tried[k]} onChange={(v) => set(k, v)} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <div className="flex gap-2.5 rounded-xl bg-[#f7fbff] p-3 text-[13px] text-body">
                  <CheckCircle2 className="mt-0.5 size-4 flex-none text-success" aria-hidden />
                  <p><b className="text-ink">Kết quả mong đợi (docs/05):</b> {f.expected}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
