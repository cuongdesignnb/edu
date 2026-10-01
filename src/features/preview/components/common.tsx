"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { useSession } from "@/lib/query/demo-hooks";
import { REGISTRY } from "@/lib/routing/registry";
import { actorMatches, SwitchPersona, type Need } from "../states/real-overlays";

/** Renders children only for the persona the live example needs; otherwise offers to switch. */
export function NeedPersona({ need, children, why }: { need: Need; children: ReactNode; why?: string }) {
  const { actor } = useSession();
  if (actorMatches(actor, need)) return <>{children}</>;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong bg-[#f9fbfe] px-4 py-3 text-[13px] text-body">
      <Info className="size-4 flex-none text-primary" aria-hidden />
      <span className="min-w-0 flex-[1_1_220px]">{why ?? "Ví dụ này đọc dữ liệu thật từ repository mock, cần đúng vai trò demo."}</span>
      <SwitchPersona need={need} />
    </div>
  );
}

/** Screens that list this component in the registry (computed). */
export function usedIn(componentId: string) {
  return REGISTRY.filter((s) => s.component_ids.includes(componentId) && s.scope !== "optional");
}

export function UsedAt({ id, extra }: { id: string; extra?: { href: string; label: string }[] }) {
  const list = usedIn(id);
  const show = list.length > 12 ? list.slice(0, 6) : list;
  if (!show.length && !extra?.length) return null;
  return (
    <p className="text-[12.5px] text-muted">
      Dùng ở:{" "}
      {extra?.map((e, i) => <span key={e.href}>{i > 0 && ", "}<Link href={e.href} className="font-semibold text-primary-strong hover:underline">{e.label}</Link></span>)}
      {extra?.length && show.length ? ", " : ""}
      {show.map((s, i) => <span key={s.id}>{i > 0 && ", "}<Link href={s.href} className="font-semibold text-primary-strong hover:underline" title={s.title}>{s.id}</Link></span>)}
      {list.length > show.length && ` và ${list.length - show.length} màn hình khác`}
    </p>
  );
}

export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-xl border border-line bg-[#fbfdff] p-3 ${className ?? ""}`}>{children}</div>;
}
