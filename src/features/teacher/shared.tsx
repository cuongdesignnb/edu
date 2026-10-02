"use client";
import Link from "next/link";
import { clsx } from "clsx";
import { ChevronRight, Users, Trophy, FileText, Megaphone, CalendarCheck, Clock, ClipboardList, Star } from "lucide-react";
import type { ReactNode } from "react";

export const TASK_TONE: Record<string, string> = {
  danger: "bg-danger-bg text-danger-text",
  warning: "bg-warning-bg text-warning-text",
  info: "bg-primary-light text-primary-strong",
  neutral: "bg-neutral-bg text-neutral-text",
};

export const TASK_KIND_LABEL: Record<string, string> = {
  attendance: "Điểm danh",
  conduct: "Thi đua",
  evidence: "Minh chứng",
  announcement: "Thông báo",
  groups: "Phân tổ",
};

/** The button label of a task depends on what the task opens. */
export function taskActionLabel(t: { kind: string; status: string }) {
  if (t.kind === "attendance") return t.status === "Chưa công bố" ? "Mở bảng" : "Điểm danh";
  if (t.kind === "conduct" || t.kind === "evidence") return "Xem ngay";
  return "Mở";
}

export function TaskIcon({ kind }: { kind: string }) {
  const map: Record<string, { icon: ReactNode; tone: string }> = {
    attendance: { icon: <CalendarCheck className="size-5" />, tone: "tone-green" },
    conduct: { icon: <Trophy className="size-5" />, tone: "tone-amber" },
    evidence: { icon: <FileText className="size-5" />, tone: "tone-purple" },
    announcement: { icon: <Megaphone className="size-5" />, tone: "tone-pink" },
  };
  const m = map[kind] ?? { icon: <ClipboardList className="size-5" />, tone: "tone-blue" };
  return <span className={clsx("icon-tile icon-tile-sm !size-10 flex-none", m.tone)} aria-hidden>{m.icon}</span>;
}

/** Icon for an audit feed line, chosen from the action wording. */
export function feedIcon(action: string) {
  const a = action.toLowerCase();
  if (a.includes("điểm danh") || a.includes("chuyên cần")) return { icon: <Users className="size-4" />, tone: "tone-green" };
  if (a.includes("thi đua") || a.includes("ghi nhận") || a.includes("chốt")) return { icon: <Trophy className="size-4" />, tone: "tone-amber" };
  if (a.includes("minh chứng") || a.includes("hoạt động")) return { icon: <Star className="size-4" />, tone: "tone-purple" };
  if (a.includes("thông báo")) return { icon: <Megaphone className="size-4" />, tone: "tone-pink" };
  if (a.includes("link") || a.includes("tra cứu")) return { icon: <FileText className="size-4" />, tone: "tone-blue" };
  return { icon: <Clock className="size-4" />, tone: "tone-blue" };
}

/** R05 top class card: illustration, class name, role badges, size and motto. */
export function ClassHeroCard({ href, name, roles, size, motto, homeroom }: { href: string; name: string; roles: string[]; size: number | null; motto?: string; homeroom: boolean }) {
  return (
    <Link href={href} className="card group flex min-w-0 items-center gap-4 bg-gradient-to-r from-[#eef6ff] via-white to-white p-4 hover:border-[#9cc7f5]">
      <span className="flex size-[96px] flex-none items-end justify-center overflow-hidden rounded-full bg-[#dcebff] sm:size-[112px]" aria-hidden>
        <img src="/assets/illustrations/students-trio.png" alt="" className="h-[92%] w-auto object-contain" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[28px] font-extrabold leading-none text-ink">{name}</span>
          {roles.map((r) => <span key={r} className={clsx("rounded-full px-3 py-1 text-[13px] font-semibold", homeroom && r === "Chủ nhiệm" ? "bg-primary-soft text-primary-strong" : "bg-primary-light text-primary-strong")}>{r}</span>)}
        </span>
        <span className="mt-2 flex items-center gap-1.5 text-[13.5px] text-body"><Users className="size-4 text-primary" aria-hidden />Sĩ số: <b className="text-ink">{size === null ? "Chưa có quyền xem" : `${size} học sinh`}</b></span>
        {motto && <span className="quote mt-1 block text-[15px] sm:truncate">“{motto}”</span>}
      </span>
      <span className="flex size-10 flex-none items-center justify-center rounded-full border border-line bg-white text-primary shadow-sm group-hover:bg-primary-light" aria-hidden><ChevronRight className="size-5" /></span>
      <span className="sr-only">Mở lớp {name}</span>
    </Link>
  );
}

export function weekRangeLabel(monday: string, fmt: (d: string) => string, addDays: (d: string, n: number) => string) {
  return `${fmt(monday)} – ${fmt(addDays(monday, 5))}`;
}
