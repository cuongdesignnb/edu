"use client";
import { clsx } from "clsx";
import { BookOpen, FileImage, Heart, ListChecks, Megaphone } from "lucide-react";
import type { Activity } from "@/lib/model/types";
import type { Tone } from "@/lib/formatters";
import { LinkTabs } from "@/components/ui/tabs";
import { useClassroom } from "@/features/classroom/context";

export const ILLUSTRATION_OPTIONS: { value: Activity["illustration"]; label: string }[] = [
  { value: "trophy", label: "Thi đua / phong trào" },
  { value: "stem", label: "Trải nghiệm STEM" },
  { value: "clean", label: "Vệ sinh / lao động" },
  { value: "book", label: "Học tập / đọc sách" },
  { value: "heart", label: "Thiện nguyện / kỹ năng sống" },
];

const ART: Partial<Record<Activity["illustration"], string>> = {
  trophy: "/assets/illustrations/activity-trophy.png",
  stem: "/assets/illustrations/activity-stem.png",
  clean: "/assets/illustrations/activity-clean.png",
};

/** Activity illustration tile: the three drawn illustrations, neutral icon tile for the others. */
export function ActivityArt({ kind, className }: { kind: Activity["illustration"]; className?: string }) {
  const src = ART[kind];
  if (src) return <img src={src} alt="" aria-hidden className={clsx("rounded-xl border border-line bg-[#eef6ff] object-cover", className)} />;
  const Icon = kind === "heart" ? Heart : BookOpen;
  return (
    <span aria-hidden className={clsx("flex items-center justify-center rounded-xl border border-line", kind === "heart" ? "bg-[#fdeef1] text-[#d6405c]" : "bg-[#eef4ff] text-primary", className)}>
      <Icon className="size-1/3" strokeWidth={1.6} />
    </span>
  );
}

export interface ActivityLike { status: Activity["status"]; dueSoon?: boolean; overdue?: boolean }

/** Activity lifecycle label: Nháp / Đang diễn ra / Sắp đến hạn / Quá hạn / Đã kết thúc (text + dot, never colour alone). */
export function activityState(a: ActivityLike): { label: string; tone: Tone } {
  if (a.status === "draft") return { label: "Nháp", tone: "neutral" };
  if (a.status === "closed") return { label: "Đã kết thúc", tone: "neutral" };
  if (a.overdue) return { label: "Quá hạn", tone: "danger" };
  if (a.dueSoon) return { label: "Sắp đến hạn", tone: "warning" };
  return { label: "Đang diễn ra", tone: "success" };
}

export function scopeLabel(a: { assignedGroupId?: string; groupName?: string; assignedStudentIds: string[] }, classSize: number) {
  if (a.assignedGroupId) return a.groupName ?? "Một tổ";
  if (a.assignedStudentIds.length >= classSize && classSize > 0) return "Cả lớp";
  return `${a.assignedStudentIds.length} học sinh`;
}

export const EVIDENCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" },
  supplement: { label: "Cần bổ sung", tone: "danger" },
};

export const SHARE_LABEL: Record<string, string> = {
  internal: "Nội bộ",
  class_parents: "Phụ huynh cả lớp",
  student_parent: "Riêng phụ huynh một em",
};

/** R09 section tabs "Hoạt động | Minh chứng | Thông báo" (real routes; each shown only with the matching permission). */
export function ActivitySectionTabs() {
  const { base, can } = useClassroom();
  const items = [
    ...(can("activity.manage") || can("evidence.manage") || can("report.class") ? [{ href: `${base}/activities`, label: "Hoạt động", icon: <ListChecks /> }] : []),
    ...(can("evidence.manage") || can("report.class") ? [{ href: `${base}/evidence`, label: "Minh chứng", icon: <FileImage /> }] : []),
    ...(can("announcement.class") ? [{ href: `${base}/announcements`, label: "Thông báo", icon: <Megaphone /> }] : []),
  ];
  if (items.length < 2) return null;
  return <LinkTabs items={items} exactFirst={false} className="no-print w-full sm:w-auto" />;
}

/** Stable key for the reference date used in queries. */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
