"use client";
import { clsx } from "clsx";
import type { Announcement } from "@/lib/model/types";

export type BodyBlock = Announcement["body"][number];

/** Read-only renderer for structured announcement bodies (no HTML is ever injected). */
export function AnnouncementBody({ body, className }: { body: BodyBlock[]; className?: string }) {
  const groups: (BodyBlock | BodyBlock[])[] = [];
  for (const b of body) {
    if (!b.text.trim()) continue;
    const last = groups[groups.length - 1];
    if (b.type === "li" && Array.isArray(last)) last.push(b);
    else groups.push(b.type === "li" ? [b] : b);
  }
  if (!groups.length) return <p className={clsx("text-sm italic text-muted", className)}>Chưa có nội dung.</p>;
  return (
    <div className={clsx("space-y-2.5 text-[14.5px] leading-relaxed text-body", className)}>
      {groups.map((g, i) => Array.isArray(g)
        ? <ul key={i} className="list-disc space-y-1 pl-6">{g.map((x, j) => <li key={j} className="whitespace-pre-line">{x.text}</li>)}</ul>
        : g.type === "h" ? <h3 key={i} className="pt-1 text-[16px] font-bold text-ink">{g.text}</h3>
        : <p key={i} className="whitespace-pre-line">{g.text}</p>)}
    </div>
  );
}

export const ANNOUNCEMENT_AUDIENCE: Record<Announcement["audience"], string> = {
  staff: "Nội bộ nhân sự",
  families: "Gia đình học sinh",
  all: "Nhân sự và gia đình",
};
