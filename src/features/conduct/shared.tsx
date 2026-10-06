"use client";
import { useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import {
  CalendarCheck, Trophy, ChevronLeft, ChevronRight, Clock, UserX, Shirt, FileX, TriangleAlert, MessageSquare, Users, Flag, Star, Sparkles, CircleDot,
} from "lucide-react";
import type { RuleSet } from "@/lib/model/types";
import { conductRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtPoints, type Tone } from "@/lib/formatters";
import { useClassroom } from "@/features/classroom/context";
import { Badge } from "@/components/ui/badge";

export type WeekOption = Awaited<ReturnType<typeof conductRepo.weekOptions>>[number];

/* ------------------------------ labels ------------------------------ */
export const RECORD_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_review: { label: "Chờ rà soát", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" },
  void: { label: "Đã loại", tone: "neutral" },
};

export const PERIOD_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Đang mở — chưa công bố", tone: "neutral" },
  locked: { label: "Đã chốt, chưa công bố", tone: "purple" },
  published: { label: "Đã công bố", tone: "success" },
};

const SHORT_STATUS: Record<string, string> = { open: "Đang mở", locked: "Đã chốt", published: "Đã công bố" };

export const SNAPSHOT_STATUS: Record<string, { label: string; tone: Tone }> = {
  published: { label: "Đã công bố", tone: "success" },
  superseded: { label: "Đã thay bằng bản mới", tone: "neutral" },
  locked: { label: "Đã chốt, chưa công bố", tone: "purple" },
  withdrawn: { label: "Đã rút", tone: "danger" },
};

export const ADJ_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt, chờ công bố lại", tone: "info" },
  rejected: { label: "Từ chối", tone: "danger" },
  published: { label: "Đã công bố lại", tone: "success" },
};

export const ADJ_KIND: Record<string, string> = {
  remove_record: "Bỏ một ghi nhận",
  change_points: "Đổi điểm một ghi nhận",
  add_record: "Bổ sung ghi nhận",
};

/** dd/MM from an ISO date (no timezone shift). */
export function dm(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function weekLabel(w: { index: number; startDate: string; endDate: string }) {
  return `Tuần ${w.index} (${dm(w.startDate)} – ${dm(w.endDate)})`;
}

type GradeBand=import('@/lib/repositories/connected/conduct').RuleItem['bands'][number];
export function gradeTone(label: string, bands?: GradeBand[]): Tone {
  return (bands?.find((b) => b.label === label)?.tone ?? "info") as Tone;
}

export function GradeBadge({ label, bands }: { label: string; bands?: GradeBand[] }) {
  return <Badge tone={gradeTone(label, bands)} dot={false} className="min-w-[64px] justify-center">{label}</Badge>;
}

export function Points({ value, className }: { value: number; className?: string }) {
  return <span className={clsx("font-semibold tabular-nums", value > 0 ? "text-success-text" : value < 0 ? "text-danger-text" : "text-ink", className)}>{fmtPoints(value)}</span>;
}

/* ------------------------------ rule icons ------------------------------ */
const ICONS: Record<string, { I: typeof Clock; cls: string }> = {
  clock: { I: Clock, cls: "text-warning bg-warning-bg" },
  "user-x": { I: UserX, cls: "text-danger bg-danger-bg" },
  shirt: { I: Shirt, cls: "text-primary bg-primary-light" },
  "file-x": { I: FileX, cls: "text-[#e0661b] bg-[#fff0e3]" },
  alert: { I: TriangleAlert, cls: "text-danger bg-danger-bg" },
  message: { I: MessageSquare, cls: "text-success bg-success-bg" },
  users: { I: Users, cls: "text-primary bg-primary-light" },
  flag: { I: Flag, cls: "text-success bg-success-bg" },
  star: { I: Star, cls: "text-warning bg-warning-bg" },
  sparkles: { I: Sparkles, cls: "text-purple bg-purple-bg" },
};

export function RuleIcon({ icon, size = 30 }: { icon: string; size?: number }) {
  const m = ICONS[icon] ?? { I: CircleDot, cls: "text-muted bg-neutral-bg" };
  return (
    <span className={clsx("inline-flex flex-none items-center justify-center rounded-lg", m.cls)} style={{ width: size, height: size }} aria-hidden>
      <m.I className="size-4" />
    </span>
  );
}

/* ------------------------------ week selection (?week=) ------------------------------ */
export function useWeekParam() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = sp.get("week") ?? undefined;
  const set = useCallback((id: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("week", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [sp, router, pathname]);
  return [value, set] as const;
}

/** Week options + the currently selected week (URL param, else the current week). */
export function useWeeks() {
  const { schoolId, yearId, classId } = useClassroom();
  const q = useRepo(["conduct-weeks", schoolId, yearId, classId], (ctx) => conductRepo.weekOptions(ctx, schoolId, yearId, classId));
  const [param, setWeek] = useWeekParam();
  const weeks = q.data ?? [];
  const week = weeks.find((w) => w.id === param) ?? weeks.find((w) => w.isCurrent) ?? weeks[0];
  return { query: q, weeks, week, setWeek };
}

/** C — week selector with previous / next arrows (like the date stepper in R08). */
export function WeekSelect({ weeks, week, onChange, className }: { weeks: WeekOption[]; week?: WeekOption; onChange: (id: string) => void; className?: string }) {
  const i = week ? weeks.findIndex((w) => w.id === week.id) : -1;
  const older = i >= 0 ? weeks[i + 1] : undefined; // weeks are sorted newest first
  const newer = i > 0 ? weeks[i - 1] : undefined;
  return (
    <div className={clsx("flex min-w-0 items-center gap-2", className)}>
      <button type="button" className="btn btn-secondary btn-icon flex-none" disabled={!older} onClick={() => older && onChange(older.id)} aria-label="Tuần trước"><ChevronLeft className="size-4" /></button>
      <select aria-label="Chọn tuần" className="select min-w-0 flex-1 sm:w-[340px] sm:flex-none" value={week?.id ?? ""} onChange={(e) => onChange(e.target.value)}>
        {weeks.map((w) => (
          <option key={w.id} value={w.id}>{weekLabel(w)}{w.isCurrent ? " · tuần này" : ""} · {SHORT_STATUS[w.status] ?? w.status}</option>
        ))}
      </select>
      <button type="button" className="btn btn-secondary btn-icon flex-none" disabled={!newer} onClick={() => newer && onChange(newer.id)} aria-label="Tuần sau"><ChevronRight className="size-4" /></button>
    </div>
  );
}

export function PeriodBadge({ status }: { status: string }) {
  const s = PERIOD_STATUS[status] ?? PERIOD_STATUS.open;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/* ------------------------------ navigation ------------------------------ */
/** Toggle like R08 header: "Điểm danh trong ngày" | "Thi đua theo tuần". */
export function ModeToggle() {
  const { base, header } = useClassroom();
  const canAttendance = header.tabs.some((t) => t.key === "attendance");
  const item = "inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-semibold transition-colors sm:gap-2 sm:px-4 sm:text-[14px]";
  return (
    <div className="no-print grid w-full max-w-full grid-cols-2 rounded-xl border border-line bg-white p-1 sm:inline-flex sm:w-auto" role="group" aria-label="Chế độ xem">
      {canAttendance && <Link href={`${base}/attendance`} className={clsx(item, "text-primary-strong hover:bg-primary-light")}><CalendarCheck className="size-[18px]" aria-hidden />Điểm danh trong ngày</Link>}
      <Link href={`${base}/conduct/weekly`} className={clsx(item, "bg-primary text-white")} aria-current="page"><Trophy className="size-[18px]" aria-hidden />Thi đua theo tuần</Link>
    </div>
  );
}

/** Section nav inside the conduct area; items follow the actor's class actions. */
export function ConductNav({ weekId }: { weekId?: string }) {
  const { base, can } = useClassroom();
  const pathname = usePathname();
  const w = weekId ? `?week=${encodeURIComponent(weekId)}` : "";
  const items: { path: string; query?: string; label: string; show: boolean }[] = [
    { path: `${base}/conduct`, label: "Ghi nhận", show: true },
    { path: `${base}/conduct/weekly`, query: w, label: "Tổng hợp tuần", show: can("conduct.record") || can("conduct.review") || can("report.class") },
    { path: `${base}/conduct/review`, query: w, label: "Rà soát và chốt", show: can("conduct.review") || can("conduct.lock") },
    { path: `${base}/publications`, label: "Kết quả đã công bố", show: can("conduct.review") || can("report.class") || can("adjustment.approve") },
    { path: `${base}/adjustments`, label: "Điều chỉnh sau chốt", show: can("adjustment.request") || can("adjustment.approve") || can("conduct.review") },
    { path: `${base}/rules`, label: "Nội quy áp dụng", show: true },
  ];
  return (
    <nav className="card no-print tabbar p-1.5" aria-label="Mục thi đua">
      {items.filter((i) => i.show).map((i, n) => {
        const active = n === 0 ? pathname === i.path : pathname === i.path || pathname.startsWith(`${i.path}/`);
        return <Link key={i.path} href={`${i.path}${i.query ?? ""}`} className="tab whitespace-nowrap" aria-current={active ? "page" : undefined}>{i.label}</Link>;
      })}
    </nav>
  );
}

/** ST15 / ST16 / ST17 banner for a week. */
export function PeriodStateBanner({ status, snapshot, lockedAt, lockedByName }: { status: string; snapshot?: { versionNo: number; publishedAt?: string; ruleSetName: string; ruleSetVersionNo: number } | null; lockedAt?: string; lockedByName?: string }) {
  if (status === "published" && snapshot) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#bfe8d6] bg-success-bg px-4 py-3 text-[13.5px] text-success-text" role="status">
        <b>Đã công bố — bản {snapshot.versionNo}</b>
        <span>Công bố lúc {snapshot.publishedAt ? fmtDate(snapshot.publishedAt) : "—"} · {snapshot.ruleSetName} (bản {snapshot.ruleSetVersionNo})</span>
        <span className="basis-full text-[12.5px]">Mỗi gia đình có đường dẫn riêng còn hiệu lực chỉ xem được dòng của con mình. Thay đổi phải đi qua điều chỉnh sau chốt.</span>
      </div>
    );
  }
  if (status === "locked") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#d9ccff] bg-purple-bg px-4 py-3 text-[13.5px] text-purple-text" role="status">
        <b>Đã chốt, chưa công bố</b>
        <span>Nhân sự đủ quyền đã thấy; phụ huynh chưa thấy.</span>
        {lockedAt && <span className="text-[12.5px]">Chốt lúc {fmtDate(lockedAt)}{lockedByName ? ` bởi ${lockedByName}` : ""}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-neutral-bg px-4 py-3 text-[13.5px] text-neutral-text" role="status">
      <b>Chưa công bố</b>
      <span>Tuần đang mở: ghi nhận được lưu ngay ở trạng thái “Chờ rà soát”. Phụ huynh chưa thấy kết quả tuần này.</span>
    </div>
  );
}

/** Cap / floor explanation for a rule set. */
export function limitsNote(rs: Pick<RuleSet, "cap" | "floor">) {
  if (rs.cap === undefined && rs.floor === undefined) return "Bộ nội quy này không đặt trần/sàn cho tổng điểm.";
  return `Giới hạn tổng điểm: ${rs.floor !== undefined ? `sàn ${rs.floor}` : "không sàn"}, ${rs.cap !== undefined ? `trần ${rs.cap}` : "không trần"}.`;
}
