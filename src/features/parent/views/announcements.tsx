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
                        {a.scopeLabels.map(scope=><Badge key={scope} tone="info" dot={false}>{scope}</Badge>)}<span>{a.from}</span><span aria-hidden>·</span><span>{fmtDate(a.publishedAt)}</span>
                        {a.attachments.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" aria-hidden />{a.attachments.length} tệp</span>}
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
            <ParentHeader title={a.title} back={{ href: href("announcements"), label: "Thông báo" }} subtitle={`${a.from} · Công bố ${fmtDateTime(a.publishedAt)}`} />
            <Card className="card-pad">
              <article className="max-w-3xl space-y-3 text-[15px] leading-relaxed text-body [&_h2]:pt-1 [&_h2]:text-[17px] [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3" dangerouslySetInnerHTML={{__html:a.bodyHtml}}/>
            </Card>
            <Card>
              <CardHeader icon={<Paperclip className="size-5" />} title="Tệp đính kèm" subtitle={a.attachments.length ? `${a.attachments.length} tệp được chia sẻ` : undefined} />
              {a.attachments.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {a.attachments.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{f.name}</span><span className="text-[12px] text-muted">{fmtBytes(f.size)}</span></span>
                      <div className="flex gap-2">{f.viewAllowed&&viewer.button(f)}{f.downloadAllowed&&<Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => download(f.id)} aria-label={`Tải ${f.name}`}>Tải</Button>}</div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState compact title="Chưa có tệp đính kèm được chia sẻ" />}
            </Card>
            {viewer.node}
          </>
        )}
      </PState>
    </ParentPage>
  );
}
