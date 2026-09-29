"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, BookOpenText, ArrowLeft, LifeBuoy, ListOrdered } from "lucide-react";
import { matches } from "@/lib/formatters";
import { authDemoRepo } from "@/lib/repositories/platform-extra";
import { useRepo, useSession } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { Card, Callout } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyFiltered } from "@/components/ui/states";
import { HELP_SECTIONS } from "./help-content";

/** AU10 — help centre: four areas + publication process, local search, anchors. */
export function HelpCenter() {
  const { actor } = useSession();
  const [q, setQ] = useState("");
  const contact = useRepo(["public-contact"], () => authDemoRepo.publicContact());
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, []);
  const sections = useMemo(() => HELP_SECTIONS.map((s) => ({ ...s, articles: s.articles.filter((a) => !q || matches(q, s.title, a.title, ...a.paragraphs, ...(a.steps ?? []))) })).filter((s) => !q || s.articles.length), [q]);
  const hits = sections.reduce((n, s) => n + s.articles.length, 0);
  const back = actor.kind === "platform" ? { href: "/platform", label: "Về khu vực vận hành" } : actor.kind === "staff" ? { href: "/choose-school", label: "Về không gian của tôi" } : { href: "/login", label: "Về đăng nhập nhân sự" };

  return (
    <div className="page">
      <PageHeader title="Hướng dẫn sử dụng" subtitle="Cách EduManage vận hành ở bốn khu vực: nền tảng, nhà trường, giáo viên và phụ huynh" quote={["Hiểu đúng quy trình", "để làm việc nhẹ nhàng hơn"]} illustration="/assets/illustrations/books-plant.png"
        actions={<ButtonLink href={back.href} icon={<ArrowLeft className="size-4" />}>{back.label}</ButtonLink>} />
      <Card className="p-4">
        <label htmlFor="help-search" className="label">Tìm trong hướng dẫn</label>
        <div className="input-icon mt-1.5">
          <Search className="size-4" aria-hidden />
          <input id="help-search" type="search" className="input" placeholder="Ví dụ: công bố, lời mời, tạm dừng, link tra cứu…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="mt-2 text-[13px] text-muted" aria-live="polite">{q ? `${hits} bài phù hợp` : "Tìm kiếm cục bộ trong trang này, không gửi dữ liệu đi đâu."}</p>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Mục lục hướng dẫn" className="lg:sticky lg:top-[calc(var(--topbar-h)+16px)] lg:self-start">
          <Card className="p-3">
            <p className="px-2 pb-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted">Mục lục</p>
            <ul className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {HELP_SECTIONS.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[14px] font-medium text-ink hover:bg-primary-light"><img src={`/assets/illustrations/${s.image}.png`} alt="" className="size-7 rounded-lg object-cover" />{s.title}</a></li>
              ))}
            </ul>
          </Card>
        </nav>
        <div className="min-w-0 space-y-5">
          {sections.length === 0 && <Card><EmptyFiltered what="bài hướng dẫn" onReset={() => setQ("")} /></Card>}
          {sections.map((s) => (
            <Card key={s.id} as="section" id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24 p-5">
              <div className="flex items-start gap-4">
                <img src={`/assets/illustrations/${s.image}.png`} alt="" className="size-16 flex-none rounded-2xl object-cover" />
                <div className="min-w-0">
                  <h2 id={`${s.id}-title`} className="text-[20px] font-bold text-ink">{s.title}</h2>
                  <p className="text-[13px] font-semibold text-primary-strong">{s.audience}</p>
                  <p className="mt-1 text-[14px] text-body">{s.intro}</p>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                {s.articles.map((a) => (
                  <article key={a.id} id={`${s.id}-${a.id}`} className="rounded-xl border border-line p-4">
                    <h3 className="flex items-center gap-2 text-[16px] font-bold text-ink"><BookOpenText className="size-4 text-primary" aria-hidden />{a.title}</h3>
                    {a.paragraphs.map((p) => <p key={p} className="mt-2 text-[14px] leading-relaxed text-body">{p}</p>)}
                    {a.steps && (
                      <ol className="mt-3 space-y-2">
                        {a.steps.map((st, i) => (
                          <li key={st} className="flex gap-3 text-[14px] text-body"><span className="flex size-6 flex-none items-center justify-center rounded-full bg-primary-light text-[12px] font-bold text-primary-strong">{i + 1}</span>{st}</li>
                        ))}
                      </ol>
                    )}
                  </article>
                ))}
              </div>
            </Card>
          ))}
          <Callout tone="info" icon={<LifeBuoy />} title="Cần hỗ trợ thêm?">
            Liên hệ đầu mối quản trị của trường trước. Nhà trường có thể gửi yêu cầu hỗ trợ tới nền tảng qua mục Hỗ trợ.
            {contact.data && <> Liên hệ nền tảng (mẫu): {contact.data.supportEmail} · {contact.data.supportPhone}.</>} Bản demo không có chat trực tuyến.
          </Callout>
          <p className="flex items-center gap-2 text-[13px] text-muted"><ListOrdered className="size-4" aria-hidden />Xem thêm <Link href="/privacy" className="font-semibold text-primary-strong hover:underline">Quyền riêng tư</Link> và <Link href="/terms" className="font-semibold text-primary-strong hover:underline">Điều kiện sử dụng</Link> (bản nháp).</p>
        </div>
      </div>
    </div>
  );
}
