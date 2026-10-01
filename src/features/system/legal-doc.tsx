"use client";
import { useEffect } from "react";
import Link from "next/link";
import { FileWarning, Mail, Phone, ListTree } from "lucide-react";
import { authDemoRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { PublicShell } from "@/components/layout/shells";
import { Card, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LegalSection } from "./legal-content";

/** SY03 / SY04 — draft legal page with anchor navigation, clearly marked as not yet approved. */
export function LegalDoc({ title, subtitle, sections, other }: { title: string; subtitle: string; sections: LegalSection[]; other: { href: string; label: string } }) {
  const contact = useRepo(["public-contact"], () => authDemoRepo.publicContact());
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, []);
  return (
    <PublicShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-[1_1_320px]">
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle mt-1">{subtitle}</p>
          </div>
          <img src="/assets/illustrations/family-header.png" alt="" className="hidden h-[92px] w-auto xl:block" />
        </div>
        <Callout tone="warning" icon={<FileWarning />} title={<span className="flex flex-wrap items-center gap-2">Bản nháp chờ chủ dự án/pháp chế duyệt <Badge tone="warning">Chưa thẩm định pháp lý</Badge></span>}>
          Nội dung dưới đây chỉ để xem bố cục và định hướng. Chưa có giá trị pháp lý, không phải cam kết tuân thủ hay chứng nhận nào.
        </Callout>
        <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <nav aria-label="Mục lục" className="lg:sticky lg:top-4 lg:self-start">
            <Card className="p-3">
              <p className="flex items-center gap-2 px-2 pb-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted"><ListTree className="size-4" aria-hidden />Mục lục</p>
              <ol className="space-y-0.5">
                {sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="block rounded-lg px-2 py-1.5 text-[14px] text-ink hover:bg-primary-light">{s.title}</a></li>)}
              </ol>
            </Card>
          </nav>
          <Card as="article" className="p-5 sm:p-7">
            <div className="space-y-6">
              {sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-20" aria-labelledby={`${s.id}-h`}>
                  <h2 id={`${s.id}-h`} className="text-[19px] font-bold text-ink">{s.title}</h2>
                  {s.paragraphs.map((p) => <p key={p} className="mt-2 text-[14.5px] leading-relaxed text-body">{p}</p>)}
                  {s.bullets && <ul className="mt-2 list-disc space-y-1 pl-6 text-[14.5px] text-body">{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
                </section>
              ))}
              <div className="rounded-xl border border-line bg-[#f7fbff] p-4 text-sm">
                <p className="font-semibold text-ink">Đầu mối hỗ trợ nền tảng (thông tin mẫu)</p>
                {contact.data ? (
                  <p className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-body"><span className="flex items-center gap-1.5"><Mail className="size-4 text-primary" aria-hidden />{contact.data.supportEmail}</span><span className="flex items-center gap-1.5"><Phone className="size-4 text-primary" aria-hidden />{contact.data.supportPhone}</span></p>
                ) : <p className="mt-1.5 text-muted">Đang tải…</p>}
              </div>
              <p className="text-[13px] text-muted">Xem thêm: <Link href={other.href} className="font-semibold text-primary-strong hover:underline">{other.label}</Link> · <Link href="/help" className="font-semibold text-primary-strong hover:underline">Hướng dẫn sử dụng</Link></p>
            </div>
          </Card>
        </div>
      </div>
    </PublicShell>
  );
}
