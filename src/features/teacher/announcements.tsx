"use client";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Megaphone, CheckCheck, Paperclip } from "lucide-react";
import { announcementsRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, matches } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { InlineSelect } from "@/components/ui/form";
import { FilterBar, Pagination } from "@/components/data/table";
import { EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";

type Item = Awaited<ReturnType<typeof announcementsRepo.forTeacher>>[number];
const PAGE = 8;

/** TE05 — announcements a teacher may read at THIS school only; read / unread; detail drawer. */
export function TeacherAnnouncements({ schoolId }: { schoolId: string }) {
  const q = useRepo(["teacher-announcements", schoolId], (ctx) => announcementsRepo.forTeacher(ctx, schoolId));
  return (
    <div className="page">
      <PageHeader title="Thông báo dành cho giáo viên" subtitle="Tin nội bộ và thông báo đã công bố trong phạm vi lớp bạn phụ trách"
        breadcrumbs={[{ label: "Việc hôm nay", href: `/teacher/${schoolId}` }, { label: "Thông báo" }]} illustration="/assets/illustrations/books-plant.png" />
      <QueryState query={q} skeleton="table">{(items) => <List schoolId={schoolId} items={items} />}</QueryState>
    </div>
  );
}

function List({ schoolId, items }: { schoolId: string; items: Item[] }) {
  const [text, setText] = useState("");
  const [state, setState] = useState("");
  const [origin, setOrigin] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const mark = useCommand((ctx, source: Item['source']) => announcementsRepo.markTeacherRead(ctx, schoolId, source));
  const markAll = useCommand((ctx, sources: Item['source'][]) => announcementsRepo.markAllTeacherRead(ctx, schoolId, sources), { success: (r) => `Đã đánh dấu ${r.items.length} thông báo là đã đọc` });
  const rows = useMemo(() => items.filter((a) => (!state || (state === "unread" ? !a.read : a.read)) && (!origin || a.origin === origin) && matches(text, a.title, a.summary)), [items, state, origin, text]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pageCount);
  const unread = items.filter((a) => !a.read);
  const open = items.find((a) => a.id === openId) ?? null;
  const active = !!text || !!state || !!origin;
  const reset = () => { setText(""); setState(""); setOrigin(""); setPage(1); };
  const show = (a: Item) => { setOpenId(a.id); if (!a.read) void mark.run(a.source); };
  return (
    <Card>
      <CardHeader title={`Thông báo (${unread.length} chưa đọc)`} icon={<Megaphone className="size-5 text-primary" />}
        action={unread.length > 0 && <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} loading={markAll.pending} disabled={mark.pending} onClick={() => markAll.run(unread.slice(0, 200).map((a) => a.source))}>Đánh dấu {unread.length > 200 ? '200 thông báo' : 'tất cả'} đã đọc</Button>} />
      {markAll.error && <Callout tone="warning" className="mx-5 mb-3" title="Chưa xác nhận đánh dấu đã đọc">{markAll.error.message}</Callout>}
      <FilterBar q={text} onQ={(v) => { setText(v); setPage(1); }} placeholder="Tìm tiêu đề, nội dung…" active={active} onReset={reset}>
        <InlineSelect label="Trạng thái đọc" value={state} onChange={(v) => { setState(v); setPage(1); }} allLabel="Đã đọc và chưa đọc" options={[{ value: "unread", label: "Chưa đọc" }, { value: "read", label: "Đã đọc" }]} />
        <InlineSelect label="Nguồn" value={origin} onChange={(v) => { setOrigin(v); setPage(1); }} allLabel="Mọi nguồn" options={[{ value: "school", label: "Nhà trường" }, { value: "class", label: "Lớp tôi phụ trách" }]} />
      </FilterBar>
      {items.length === 0 ? <EmptyState title="Chưa có thông báo" description="Thông báo nhà trường đã công bố cho nhân sự sẽ hiện ở đây." />
        : rows.length === 0 ? <EmptyFiltered onReset={reset} what="thông báo" /> : (
          <>
            <ul className="divide-y divide-line border-t border-line">
              {rows.slice((cur - 1) * PAGE, cur * PAGE).map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => show(a)} className={clsx("flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-[#f7fbff]", !a.read && "bg-[#f8fbff]")}>
                    <span className={clsx("mt-1.5 size-2.5 flex-none rounded-full", a.read ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={clsx("block text-ink", a.read ? "font-medium" : "font-bold")}>{a.title}</span>
                      <span className="block truncate text-[13px] text-muted">{a.summary}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone={a.origin === "school" ? "purple" : "info"} dot={false}>{a.origin === "school" ? "Nhà trường" : `Lớp ${a.className}`}</Badge>
                        <Badge tone="neutral" dot={false}>{a.audienceLabel}</Badge>
                        {a.read ? <Badge tone="success">Đã đọc</Badge> : <Badge tone="info">Chưa đọc</Badge>}
                      </span>
                    </span>
                    <span className="flex-none text-[12px] text-muted">{fmtDate(a.publishedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={cur} pageCount={pageCount} total={rows.length} pageSize={PAGE} onPage={setPage} what="thông báo" />
          </>
        )}
      <Drawer open={!!open} onOpenChange={(o) => { if (!o) setOpenId(null); }} title={open?.title ?? ""} description={open ? `${open.origin === "school" ? "Nhà trường" : `Lớp ${open.className}`} · Công bố ${fmtDateTime(open.publishedAt)}` : undefined} width={560}
        footer={<Button variant="secondary" onClick={() => setOpenId(null)}>Đóng</Button>}>
        {open && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5"><Badge tone="neutral" dot={false}>{open.scopeLabel}</Badge><Badge tone="neutral" dot={false}>{open.audienceLabel}</Badge><Badge tone={open.read ? 'success' : 'info'}>{open.read ? 'Đã đọc' : 'Chưa đọc'}</Badge></div>
            {!open.read && <Button size="sm" variant="secondary" loading={mark.pending} onClick={() => mark.run(open.source)}>Đánh dấu đã đọc</Button>}
            {mark.error && <Callout tone="warning" title="Chưa xác nhận đã đọc">{mark.error.message}</Callout>}
            <p className="font-medium text-ink">{open.summary}</p>
            <div className="space-y-2 text-body">
              {open.body.map((b, i) => b.type === "h" ? <h3 key={i} className="pt-1 text-[15px] font-bold text-ink">{b.text}</h3> : b.type === "li" ? <p key={i} className="pl-4 before:mr-2 before:content-['•']">{b.text}</p> : <p key={i}>{b.text}</p>)}
            </div>
            {open.attachments.length > 0 && (
              <div className="rounded-xl border border-line p-3">
                <p className="mb-1 font-semibold text-ink">Tệp đính kèm</p>
                <ul className="space-y-1">{open.attachments.map((f) => f && <li key={f.id} className="flex items-center gap-2 text-body"><Paperclip className="size-4 text-muted" aria-hidden />{f.name}</li>)}</ul>
              </div>
            )}
            {open.createdByName && <p className="text-[12.5px] text-muted">Người đăng: {open.createdByName}</p>}
          </div>
        )}
      </Drawer>
    </Card>
  );
}
