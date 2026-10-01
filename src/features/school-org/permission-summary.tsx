"use client";
import { useState } from "react";
import { Building2, BookOpen, Presentation, Check } from "lucide-react";
import { nativeActionLabel } from "@/lib/api/action-labels";
import { staffRepo } from "@/lib/repositories";
import { fmtDateTime } from "@/lib/formatters";

type Member = Awaited<ReturnType<typeof staffRepo.member>>;

/** Effective native grants retain school/class/subject scope and half-open time windows. */
export function PermissionSummary({ m, compact }: { m: Pick<Member, "effectiveGrants" | "assignments" | "accessActive">; compact?: boolean }) {
  const groups = [
    { scope: "SCHOOL", title: "Toàn trường", icon: <Building2 className="size-[18px]" />, tone: "text-success-text bg-success-bg" },
    { scope: "CLASS", title: "Theo lớp", icon: <Presentation className="size-[18px]" />, tone: "text-purple bg-[#efeaff]" },
    { scope: "SUBJECT", title: "Theo môn", icon: <BookOpen className="size-[18px]" />, tone: "text-success-text bg-[#e6f7ef]" },
  ];
  return <div className="space-y-3">{groups.map(group => {
    const grants = m.effectiveGrants.filter(g => g.scopeType === group.scope);
    const count = new Set(grants.flatMap(g => g.actions)).size;
    return <section key={group.scope} className="rounded-xl border border-line p-3">
      <h4 className="flex items-center gap-2 text-[14px] font-bold text-ink"><span className={`flex size-7 items-center justify-center rounded-lg ${group.tone}`} aria-hidden>{group.icon}</span>{group.title}<span className="text-[12.5px] font-medium text-muted">({count} quyền)</span></h4>
      <div className="mt-2 space-y-2.5">{grants.length ? grants.map(g => {
        const assignment = m.assignments?.find(a => a.roleGrantId === g.id);
        return <Scope key={g.id} title={assignment?.label ?? g.roleLabel} sub={`Từ ${fmtDateTime(g.validFrom)}${g.validUntil ? ` đến trước ${fmtDateTime(g.validUntil)}` : " — không thời hạn"}`} actions={g.actions} compact={compact} />;
      }) : <p className="text-[12.5px] text-muted">{m.accessActive ? "Không có quyền đang hiệu lực trong phạm vi này." : "Quyền tại trường đang bị chặn."}</p>}</div>
    </section>;
  })}</div>;
}

function Scope({ title, sub, actions, compact }: { title: string; sub: string; actions: string[]; compact?: boolean }) {
  const [all, setAll] = useState(false);
  const limit = compact ? 4 : 8;
  const shown = all ? actions : actions.slice(0, limit);
  return <div>
    <p className="text-[13px] font-semibold text-ink">{title}</p>
    <p className="text-[11.5px] text-muted">{sub}</p>
    <ul className={`mt-1 grid gap-x-3 gap-y-0.5 ${compact ? "" : "sm:grid-cols-2"}`}>{shown.map(a => <li key={a} className="flex items-start gap-1.5 text-[12.5px] text-body"><Check className="mt-0.5 size-3.5 flex-none text-success" aria-hidden />{nativeActionLabel(a).label}</li>)}</ul>
    {actions.length > limit && <button type="button" className="mt-1 text-[12.5px] font-semibold text-primary-strong hover:underline" onClick={() => setAll(x => !x)} aria-expanded={all}>{all ? "Thu gọn" : `Xem thêm ${actions.length - limit} quyền`}</button>}
  </div>;
}
