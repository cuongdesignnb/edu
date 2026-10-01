"use client";
import Link from "next/link";
import { CalendarClock, Info, FileText, Image as ImageIcon, Download } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { FileThumb } from "@/components/ui/file";
import { fmtBytes, fmtDate, fmtDateTime } from "@/lib/formatters";
import { PState, usePRead, useHref, ParentHeader, ParentPage, ACTIVITY_STATUS, ACTIVITY_ILLUSTRATION } from "./common";
import { useFileViewer, useSafeDownload } from "./file-viewer";

const STATUS:Record<string,{label:string;tone:'neutral'|'info'|'warning'|'success'|'danger'}>={ASSIGNED:{label:'Được giao',tone:'neutral'},SUBMITTED:{label:'Chờ duyệt',tone:'warning'},NEEDS_REVISION:{label:'Cần bổ sung',tone:'danger'},APPROVED:{label:'Đã duyệt',tone:'success'},EXCUSED:{label:'Được miễn',tone:'info'}};
const sub=(status:string)=>STATUS[status];

/** PA08 — activities of the child (status of the child only; no submit/upload). */
export function ParentActivitiesView() {
  const href = useHref();
  const q = usePRead(["activities"], (k, s) => parentRepo.activities(k, s));
  return (
    <ParentPage>
      <ParentHeader title="Hoạt động của con" subtitle="Hoạt động giáo viên đã chia sẻ với gia đình và tình trạng của riêng con" />
      <PState query={q} skeleton="cards">
        {(list) => list.length === 0 ? <Card><EmptyState title="Chưa có hoạt động được chia sẻ" description="Khi giáo viên chia sẻ hoạt động có con tham gia, thông tin sẽ hiện ở đây." /></Card> : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((a) => (
                <Link key={a.id} href={href(`activities/${a.id}`)} className="card group flex flex-col overflow-hidden hover:border-primary-soft">
                  <div className="flex h-[120px] items-end justify-center bg-gradient-to-b from-[#eaf3ff] to-white"><img src={ACTIVITY_ILLUSTRATION[a.illustration??"book"] ?? ACTIVITY_ILLUSTRATION.book} alt="" className="h-[110px] w-auto object-contain" /></div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex flex-wrap gap-1.5">{a.status&&<Badge tone={ACTIVITY_STATUS[a.status].tone}>{ACTIVITY_STATUS[a.status].label}</Badge>}</div>
                    <p className="font-bold text-ink group-hover:text-primary-strong">{a.title}</p>
                    <p className="line-clamp-2 text-[13px] text-muted">{a.description}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-[12.5px]">
                      <span className="flex items-center gap-1.5 text-body"><CalendarClock className="size-4 text-primary" aria-hidden />Hạn {fmtDate(a.dueDate)}</span>
                      <span className="flex items-center gap-1.5"><span className="text-muted">Của con:</span><Badge tone={sub(a.submission).tone}>{sub(a.submission).label}</Badge></span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <Callout tone="info" icon={<Info />}>Minh chứng do giáo viên ghi nhận tại trường. Gia đình không nộp bài hay tải tệp qua trang này.</Callout>
          </>
        )}
      </PState>
    </ParentPage>
  );
}

/** PA09 — activity detail with shared evidence of this child only. */
export function ParentActivityDetailView({ activityId }: { activityId: string }) {
  const href = useHref();
  const viewer = useFileViewer();
  const download = useSafeDownload();
  const q = usePRead(["activity", activityId], (k, s) => parentRepo.activity(k, s, activityId));
  return (
    <ParentPage>
      <PState query={q} skeleton="detail" backHref={href("activities")} backLabel="Về danh sách hoạt động">
        {(a) => (
          <>
            <ParentHeader title={a.title} back={{ href: href("activities"), label: "Hoạt động của con" }} subtitle={`Hạn ${fmtDate(a.dueDate)}`} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <div className="flex h-[150px] items-end justify-center rounded-t-[14px] bg-gradient-to-b from-[#eaf3ff] to-white"><img src={ACTIVITY_ILLUSTRATION[a.illustration??"book"] ?? ACTIVITY_ILLUSTRATION.book} alt="" className="h-[140px] w-auto object-contain" /></div>
                <div className="p-5">
                  <h2 className="card-title">Nội dung hoạt động</h2>
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-body">{a.description}</p>
                </div>
              </Card>
              <Card className="card-pad h-fit">
                <h2 className="card-title">Tình trạng của con</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2"><dt className="text-muted">Hoạt động</dt><dd>{a.status&&<Badge tone={ACTIVITY_STATUS[a.status].tone}>{ACTIVITY_STATUS[a.status].label}</Badge>}</dd></div>
                  <div className="flex items-center justify-between gap-2"><dt className="text-muted">Minh chứng của con</dt><dd><Badge tone={sub(a.submission).tone}>{sub(a.submission).label}</Badge></dd></div>
                  <div className="flex items-center justify-between gap-2"><dt className="text-muted">Hạn</dt><dd className="font-medium text-ink">{fmtDate(a.dueDate)}</dd></div>
                  {a.updatedAt && <div className="flex items-center justify-between gap-2"><dt className="text-muted">Cập nhật hoạt động</dt><dd className="font-medium text-ink">{fmtDateTime(a.updatedAt)}</dd></div>}
                </dl>
                {a.note && <Callout tone="warning" className="mt-3" title="Giáo viên ghi chú">{a.note}</Callout>}
                <p className="mt-3 text-[12.5px] text-muted">Việc bổ sung minh chứng thực hiện tại lớp với giáo viên, không nộp qua trang này.</p>
              </Card>
            </div>
            <Card>
              <CardHeader icon={<ImageIcon className="size-5" />} title="Minh chứng của con được chia sẻ" subtitle={`${a.evidence.length} tệp`} />
              {a.evidence.length ? (
                <ul className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
                  {a.evidence.map((f) => f && (
                    <li key={f.id} className="rounded-xl border border-line p-3">
                      {f.viewAllowed?<button type="button" onClick={() => viewer.open(f)} className="block w-full" aria-label={`Xem ${f.name}`}><FileThumb file={f}/></button>:<FileThumb file={f}/>}
                      <p className="mt-2 truncate text-[13.5px] font-semibold text-ink" title={f.name}>{f.name}</p>
                      <p className="text-[12px] text-muted">{fmtBytes(f.size)} · Công bố {fmtDate(f.createdAt)}</p>
                      <div className="mt-2 flex gap-2">{f.viewAllowed&&viewer.button(f)}{f.downloadAllowed&&<Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => download(f.id)} aria-label={`Tải ${f.name}`}>Tải</Button>}</div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState compact icon={<FileText className="size-6" />} title="Chưa có minh chứng được chia sẻ" description="Chỉ minh chứng đã duyệt và được giáo viên cho phép chia sẻ mới hiện ở đây." />}
            </Card>
            {viewer.node}
          </>
        )}
      </PState>
    </ParentPage>
  );
}
