"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Megaphone, Paperclip, Download, ChevronRight } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { fmtBytes, fmtDate, fmtDateTime, matches } from "@/lib/formatters";
import { PState, usePRead, useHref, ParentHeader, ParentPage } from "./common";
import { useFileViewer, useSafeDownload } from "./file-viewer";

const SCOPE: Record<string, string> = { school: "Toàn trường", grade: "Khối lớp", class: "Lớp của con", student: "Riêng gia đình" };

/** PA10 — announcements whose audience includes this student; local search only. */
export function ParentAnnouncementsView() {
  const href = useHref();
  const [text, setText] = useState("");
  const qs = text.trim();
  const q = usePRead(["announcements"], (k, s) => parentRepo.announcements(k, s));
  return (
    <ParentPage>
      <ParentHeader title="Thông báo dành cho gia đình" subtitle="Thông báo nhà trường và giáo viên đã công bố cho học sinh này" />
      <Card>
        <CardHeader icon={<Megaphone className="size-5" />} title="Danh sách thông báo"
          action={<label className="input-icon w-full sm:w-[300px]"><Search aria-hidden /><span className="sr-only">Tìm thông báo</span><input className="input" type="search" placeholder="Tìm trong thông báo của con…" value={text} onChange={(e) => setText(e.target.value)} /></label>} />
        <PState query={q} skeleton="table">
          {(all) => { const list = all.filter((a) => matches(qs, a.title, a.summary, a.from)); return list.length === 0 ? (
            qs ? <EmptyState compact icon={<Search className="size-6" />} title="Không có thông báo khớp từ khóa" description={`Không tìm thấy “${qs}”.`} action={<Button size="sm" onClick={() => setText("")}>Xóa tìm kiếm</Button>} />
              : <EmptyState compact title="Chưa có thông báo dành cho gia đình" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {list.map((a) => (
                <li key={a.id}>
                  <Link href={href(`announcements/${a.id}`)} className="group flex items-start gap-3 px-5 py-3.5 hover:bg-[#f7fbff]">
                    <span className="icon-tile icon-tile-sm tone-pink" aria-hidden><Megaphone className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink group-hover:text-primary-strong">{a.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{a.summary}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                        <Badge tone="info" dot={false}>{SCOPE[a.scope] ?? a.scope}</Badge><span>{a.from}</span><span aria-hidden>·</span><span>{fmtDate(a.publishedAt)}</span>
                        {a.attachments > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" aria-hidden />{a.attachments} tệp</span>}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 size-4 flex-none text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ); }}
        </PState>
      </Card>
    </ParentPage>
  );
}

/** PA11 — detail with allowed attachments (preview / download). */
export function ParentAnnouncementDetailView({ announcementId }: { announcementId: string }) {
  const href = useHref();
  const viewer = useFileViewer();
  const download = useSafeDownload();
  const q = usePRead(["announcement", announcementId], (k, s) => parentRepo.announcement(k, s, announcementId));
  return (
    <ParentPage>
      <PState query={q} skeleton="detail" backHref={href("announcements")} backLabel="Về danh sách thông báo">
        {(a) => (
          <>
            <ParentHeader title={a.title} back={{ href: href("announcements"), label: "Thông báo" }} subtitle={`${a.from ?? "Nhà trường"} · Công bố ${fmtDateTime(a.publishedAt)}`} />
            <Card className="card-pad">
              <article className="max-w-3xl space-y-3 text-[15px] leading-relaxed text-body">
                {a.body.map((b, i) => b.type === "h" ? <h2 key={i} className="pt-1 text-[17px] font-bold text-ink">{b.text}</h2>
                  : b.type === "li" ? <p key={i} className="flex gap-2 pl-2"><span aria-hidden>•</span><span>{b.text}</span></p>
                    : <p key={i}>{b.text}</p>)}
              </article>
            </Card>
            <Card>
              <CardHeader icon={<Paperclip className="size-5" />} title="Tệp đính kèm" subtitle={a.attachments.length ? `${a.attachments.length} tệp được chia sẻ` : undefined} />
              {a.attachments.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {a.attachments.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{f.name}</span><span className="text-[12px] text-muted">{fmtBytes(f.size)}</span></span>
                      <div className="flex gap-2">{viewer.button(f)}<Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => download(f.id)} aria-label={`Tải ${f.name}`}>Tải</Button></div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState compact title="Thông báo không có tệp đính kèm" />}
            </Card>
            {viewer.node}
          </>
        )}
      </PState>
    </ParentPage>
  );
}
