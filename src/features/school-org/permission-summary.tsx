"use client";
import { useState } from "react";
import { Building2, BookOpen, Presentation, Check } from "lucide-react";
import type { ActionKey } from "@/lib/model/types";
import { ACTION_LABELS } from "@/lib/permissions/actions";
import { staffRepo } from "@/lib/repositories";
import { fmtRange } from "./common";

type Member = Awaited<ReturnType<typeof staffRepo.member>>;

/**
 * Read-only permission summary grouped by scope (Toàn trường / Theo lớp / Theo môn).
 * Vietnamese labels only; there are no toggles pretending to edit — editing goes through
 * role templates (SC14) or assignments (SC11).
 */
export function PermissionSummary({ m, compact }: { m: Member; compact?: boolean }) {
  const live = m.assignments.filter((a) => a.live);
  const homeroom = live.filter((a) => a.kind === "homeroom");
  const subject = live.filter((a) => a.kind === "subject");
  const schoolCount = new Set(m.roles.flatMap((r) => r.actions)).size;
  return (
    <div className="space-y-3">
      <Group icon={<Building2 className="size-[18px]" />} tone="text-success-text bg-success-bg" title="Toàn trường" count={schoolCount} empty="Không có mẫu quyền nhà trường — chỉ làm việc theo lớp/môn được phân công.">
        {m.roles.map((r) => <Scope key={r.id} title={r.name} sub="Mẫu quyền nhà trường" actions={r.actions} compact={compact} />)}
      </Group>
      <Group icon={<Presentation className="size-[18px]" />} tone="text-purple bg-[#efeaff]" title="Theo lớp" count={homeroom.reduce((n, a) => n + a.actions.length, 0)} empty="Không chủ nhiệm lớp nào trong thời gian hiện tại.">
        {homeroom.map((a) => <Scope key={a.id} title={a.label} sub={`Hiệu lực ${fmtRange(a.validFrom, a.validTo)}`} actions={a.actions} compact={compact} />)}
      </Group>
      <Group icon={<BookOpen className="size-[18px]" />} tone="text-success-text bg-[#e6f7ef]" title="Theo môn" count={subject.reduce((n, a) => n + a.actions.length, 0)} empty="Không có phân công bộ môn đang hiệu lực.">
        {subject.map((a) => <Scope key={a.id} title={a.label} sub={`Hiệu lực ${fmtRange(a.validFrom, a.validTo)}`} actions={a.actions} compact={compact} />)}
      </Group>
    </div>
  );
}

function Group({ icon, tone, title, count, empty, children }: { icon: React.ReactNode; tone: string; title: string; count: number; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="rounded-xl border border-line p-3">
      <h4 className="flex items-center gap-2 text-[14px] font-bold text-ink"><span className={`flex size-7 items-center justify-center rounded-lg ${tone}`} aria-hidden>{icon}</span>{title}<span className="text-[12.5px] font-medium text-muted">({count} quyền)</span></h4>
      <div className="mt-2 space-y-2.5">{has ? children : <p className="text-[12.5px] text-muted">{empty}</p>}</div>
    </section>
  );
}

function Scope({ title, sub, actions, compact }: { title: string; sub: string; actions: ActionKey[]; compact?: boolean }) {
  const [all, setAll] = useState(false);
  const limit = compact ? 4 : 8;
  const shown = all ? actions : actions.slice(0, limit);
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      <p className="text-[11.5px] text-muted">{sub}</p>
      <ul className={`mt-1 grid gap-x-3 gap-y-0.5 ${compact ? "" : "sm:grid-cols-2"}`}>
        {shown.map((a) => <li key={a} className="flex items-start gap-1.5 text-[12.5px] text-body"><Check className="mt-0.5 size-3.5 flex-none text-success" aria-hidden />{ACTION_LABELS[a]?.label ?? a}</li>)}
      </ul>
      {actions.length > limit && <button type="button" className="mt-1 text-[12.5px] font-semibold text-primary-strong hover:underline" onClick={() => setAll((x) => !x)} aria-expanded={all}>{all ? "Thu gọn" : `Xem thêm ${actions.length - limit} quyền`}</button>}
    </div>
  );
}
