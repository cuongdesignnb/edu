"use client";
import Link from "next/link";
import { Mail, Phone, MapPin, Globe, Newspaper, Link2, PauseCircle, ArrowLeft, Paperclip, Download, CalendarDays, ShieldCheck } from "lucide-react";
import { announcementsRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtBytes, fmtDate, schoolStatus } from "@/lib/formatters";
import { PublicShell } from "@/components/layout/shells";
import { Breadcrumbs } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { SchoolMark } from "@/components/ui/avatar";
import { EmptyState, EmptyFiltered, QueryState } from "@/components/ui/states";
import { Pagination, useClientList } from "@/components/data/table";
import { downloadFileAsset } from "@/components/ui/file";

/** SY01 — public school page: identity, official contact and public news only. No student lookup of any kind. */
export function PublicSchoolPage({ slug }: { slug: string }) {
  const q = useRepo(["public-school", slug], () => announcementsRepo.publicSchool(slug));
  return (
    <PublicShell schoolName={q.data?.school.shortName}>
      <QueryState query={q} skeleton="cards" compactError>
        {(d) => <PublicSchoolBody d={d} />}
      </QueryState>
    </PublicShell>
  );
}

type SchoolData = Awaited<ReturnType<typeof announcementsRepo.publicSchool>>;

function PublicSchoolBody({ d }: { d: SchoolData }) {
  const s = d.school;
  const list = useClientList(d.news, { search: (n) => `${n.title} ${n.summary}`, pageSize: 6 });
  const active = s.status === "active";
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 p-5 sm:p-7" style={{ background: `linear-gradient(120deg, ${s.accentColor}14, #ffffff 70%)` }}>
          <SchoolMark name={s.name} color={active ? s.accentColor : "#64748b"} size={72} />
          <div className="min-w-0 flex-[1_1_300px]">
            <div className="flex flex-wrap items-center gap-2"><h1 className="page-title !text-[26px] sm:!text-[30px]">{s.name}</h1>{!active && <StatusBadge status={s.status} map={schoolStatus} />}</div>
            <p className="mt-0.5 text-[14px] text-muted">{s.level}</p>
            {s.motto && <p className="quote mt-2 text-[17px]">“{s.motto}”</p>}
          </div>
          <img src="/assets/illustrations/kids-school.png" alt="" className="hidden h-[110px] w-auto lg:block" />
        </div>
        {s.publicIntro && <p className="border-t border-line px-5 py-4 text-[14.5px] leading-relaxed text-body sm:px-7">{s.publicIntro}</p>}
      </Card>

      {!active && (
        <Callout tone="warning" icon={<PauseCircle />} title="Trường đang tạm dừng trên EduManage">
          Tin công khai tạm ẩn. Dữ liệu không bị xóa. Vui lòng liên hệ trực tiếp nhà trường theo thông tin chính thức bên dưới.
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Tin công khai" icon={<Newspaper className="size-5" />} subtitle={`${d.news.length} tin`} />
          {d.news.length === 0 ? (
            <EmptyState compact icon={<Newspaper className="size-6" />} title="Chưa có tin công khai" description="Nhà trường chưa công bố tin công khai nào." />
          ) : (
            <>
              <div className="px-4 pb-3">
                <label htmlFor="news-q" className="sr-only">Tìm tin</label>
                <input id="news-q" type="search" className="input" placeholder="Tìm trong tin công khai…" value={list.q} onChange={(e) => list.setQ(e.target.value)} />
              </div>
              {list.total === 0 ? <EmptyFiltered what="tin" onReset={() => list.setQ("")} /> : (
                <ul className="divide-y divide-line border-t border-line">
                  {list.items.map((n) => (
                    <li key={n.id}>
                      <Link href={`/schools/${s.slug}/announcements/${n.id}`} className="block px-5 py-4 hover:bg-[#f7fbff]">
                        <p className="text-[15.5px] font-semibold text-ink">{n.title}</p>
                        <p className="mt-0.5 text-[13.5px] text-body">{n.summary}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted"><CalendarDays className="size-3.5" aria-hidden />{fmtDate(n.publishedAt)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} onPage={list.setPage} what="tin" />
            </>
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Liên hệ chính thức" icon={<Phone className="size-5" />} />
            <dl className="divide-y divide-line px-5 pb-4">
              <InfoRow label={<span className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />Địa chỉ</span>}>{s.address}</InfoRow>
              <InfoRow label={<span className="flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden />Điện thoại</span>}>{s.publicPhone}</InfoRow>
              <InfoRow label={<span className="flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden />Email</span>}>{s.publicEmail}</InfoRow>
              {s.website && <InfoRow label={<span className="flex items-center gap-1.5"><Globe className="size-3.5" aria-hidden />Website</span>}>{s.website}</InfoRow>}
            </dl>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <img src="/assets/illustrations/family-laptop.png" alt="" className="w-20 flex-none" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-bold text-ink"><Link2 className="size-4 text-primary" aria-hidden />Dành cho phụ huynh</p>
                <p className="mt-1 text-[13.5px] text-body">Thông tin của con được xem qua <b>đường dẫn riêng</b> do nhà trường cấp. Trang công khai này không có công cụ tra cứu học sinh.</p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted"><ShieldCheck className="size-3.5" aria-hidden />Không cần tài khoản, không đăng nhập.</p>
            <div className="mt-3"><ButtonLink href="/help#phu-huynh" size="sm">Tìm hiểu đường dẫn tra cứu</ButtonLink></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

type NewsData = Awaited<ReturnType<typeof announcementsRepo.publicNews>>;

/** SY02 — one public announcement. The repository refuses anything not public+published. */
export function PublicNewsPage({ slug, id }: { slug: string; id: string }) {
  const q = useRepo(["public-news", slug, id], () => announcementsRepo.publicNews(slug, id));
  return (
    <PublicShell schoolName={q.data?.school.name}>
      <QueryState query={q} skeleton="detail" compactError>
        {(d) => <NewsBody d={d} />}
      </QueryState>
    </PublicShell>
  );
}

function NewsBody({ d }: { d: NewsData }) {
  const n = d.news;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Breadcrumbs items={[{ label: d.school.name, href: `/schools/${d.school.slug}` }, { label: "Tin công khai", href: `/schools/${d.school.slug}` }, { label: n.title }]} />
      <Card as="article" className="p-5 sm:p-8">
        <p className="flex items-center gap-1.5 text-[13px] text-muted"><CalendarDays className="size-4" aria-hidden />Đăng ngày {fmtDate(n.publishedAt)} · {d.school.name}</p>
        <h1 className="mt-2 text-[26px] font-bold leading-tight text-ink sm:text-[30px]">{n.title}</h1>
        <p className="mt-2 text-[16px] text-body">{n.summary}</p>
        <div className="mt-5 space-y-3 border-t border-line pt-5 text-[15px] leading-relaxed text-body">
          {n.body.map((b, i) => b.type === "h" ? <h2 key={i} className="pt-2 text-[18px] font-bold text-ink">{b.text}</h2> : b.type === "li" ? <p key={i} className="flex gap-2 pl-2"><span aria-hidden>•</span>{b.text}</p> : <p key={i}>{b.text}</p>)}
        </div>
        {n.attachments.length > 0 && (
          <div className="mt-6 rounded-xl border border-line p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Paperclip className="size-4" aria-hidden />Tệp đính kèm công khai</p>
            <ul className="mt-2 space-y-2">
              {n.attachments.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-body">{f.name} <span className="text-muted">({fmtBytes(f.size)})</span></span>
                  <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadFileAsset(f)}>Tải về</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <ButtonLink href={`/schools/${d.school.slug}`} icon={<ArrowLeft className="size-4" />}>Quay lại trang trường</ButtonLink>
    </div>
  );
}
