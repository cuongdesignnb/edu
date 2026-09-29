"use client";
import Link from "next/link";
import { FileText, Award, Download, ChevronRight, Info } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { useParentView } from "@/features/parent/shell";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { fmtBytes, fmtDate, fmtDateTime } from "@/lib/formatters";
import { PState, usePRead, useHref, ParentHeader, ParentPage } from "./common";
import { useFileViewer, useSafeDownload } from "./file-viewer";

/** PA13 — files shared with this student/class + published reports (links to PA05). */
export function ParentDocumentsView() {
  useParentView("documents");
  const href = useHref();
  const viewer = useFileViewer();
  const download = useSafeDownload();
  const q = usePRead(["documents"], (k, s) => parentRepo.documents(k, s));
  return (
    <ParentPage>
      <ParentHeader title="Tài liệu và báo cáo được chia sẻ" subtitle="Chỉ gồm bản đã công bố và tệp nhà trường cho phép gia đình xem" />
      <PState query={q} skeleton="table">
        {(d) => (
          <>
            <Card>
              <CardHeader icon={<Award className="size-5" />} title="Báo cáo đã công bố" subtitle={d.reports.length ? `${d.reports.length} báo cáo · xem, in hoặc lưu PDF` : undefined} />
              {d.reports.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {d.reports.map((r) => (
                    <li key={r.periodId}>
                      <Link href={href(`conduct/${r.periodId}`)} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f7fbff]">
                        <span className="icon-tile icon-tile-sm tone-amber" aria-hidden><Award className="size-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{r.title}</span><span className="text-[12.5px] text-muted">Công bố {fmtDateTime(r.publishedAt)} · {r.total} điểm</span></span>
                        <Badge tone="success">{r.grade}</Badge>
                        <ChevronRight className="size-4 flex-none text-faint" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState compact title="Chưa có báo cáo công bố" description="Báo cáo thi đua xuất hiện sau khi nhà trường công bố (nếu mục thi đua được chia sẻ qua link)." />}
            </Card>
            <Card>
              <CardHeader icon={<FileText className="size-5" />} title="Tệp được chia sẻ" subtitle={d.files.length ? `${d.files.length} tệp` : undefined} />
              {d.files.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {d.files.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="icon-tile icon-tile-sm tone-blue" aria-hidden><FileText className="size-4" /></span>
                      <span className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0"><span className="block truncate font-medium text-ink" title={f.name}>{f.name}</span><span className="text-[12.5px] text-muted">{fmtBytes(f.size)} · {fmtDate(f.createdAt)}</span></span>
                      <Badge tone={f.kind === "Riêng của con" ? "purple" : "info"} dot={false} className="ml-11 sm:ml-0">{f.kind}</Badge>
                      <div className="ml-auto flex gap-2">{viewer.button(f)}<Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => download(f.id)} aria-label={`Tải ${f.name}`}>Tải</Button></div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState compact icon={<FileText className="size-6" />} title="Chưa có tệp được chia sẻ" />}
            </Card>
            <Callout tone="info" icon={<Info />}>Tệp bị nhà trường thu hồi sẽ không còn xem hay tải được ở lần mở mới. Dữ liệu trong bản demo là dữ liệu giả.</Callout>
            {viewer.node}
          </>
        )}
      </PState>
    </ParentPage>
  );
}
