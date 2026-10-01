"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck, Users, School, FlaskConical } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { DemoScenarioBanner } from "@/components/ui/guards";

/**
 * Shared frame for AU01–AU04 (login, forgot/reset password, invitation).
 * Visual language borrowed from R04: light blue surface, navy title, teachers illustration.
 */
export function AuthFrame({ title, subtitle, children, aside, wide }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <DemoScenarioBanner />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:py-10">
        <AuthAside>{aside}</AuthAside>
        <main id="main" className={wide ? "w-full" : "mx-auto w-full max-w-[520px] lg:mx-0 lg:justify-self-end"}>
          <div className="card p-5 sm:p-7">
            <h1 className="text-[26px] font-bold leading-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[14.5px] text-body">{subtitle}</p>}
            <div className="mt-5">{children}</div>
          </div>
          <nav className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-muted" aria-label="Liên kết phụ">
            <Link href="/help" className="hover:text-primary-strong">Hướng dẫn sử dụng</Link>
            <Link href="/privacy" className="hover:text-primary-strong">Quyền riêng tư</Link>
            <Link href="/terms" className="hover:text-primary-strong">Điều kiện sử dụng</Link>

          </nav>
        </main>
      </div>
    </div>
  );
}

function AuthAside({ children }: { children?: ReactNode }) {
  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-[#d6e6fa] bg-gradient-to-br from-[#e8f3ff] via-white to-[#eef6ff] p-5 sm:p-7 lg:min-h-[560px]">
      <Brand />
      <div className="hidden lg:block">
        <p className="quote mt-6 text-[20px] leading-snug">“Mỗi thầy cô<br />là một ngọn lửa thắp sáng tương lai”</p>
        <img src="/assets/illustrations/teachers-trio.png" alt="" className="mt-6 w-full max-w-[420px]" />
      </div>
      <div className="lg:mt-auto">
        <p className="hidden text-[17px] font-bold text-ink sm:block">Không gian làm việc cho nhân sự nhà trường</p>
        <ul className="space-y-2.5 sm:mt-3 text-[13.5px] text-body">
          <li className="flex gap-2.5"><span className="icon-tile icon-tile-sm tone-blue !size-8" aria-hidden><School className="size-4" /></span><span>Mỗi trường một không gian riêng. Nhân sự chỉ vào trường đã mời mình.</span></li>
          <li className="hidden gap-2.5 sm:flex"><span className="icon-tile icon-tile-sm tone-green !size-8" aria-hidden><Users className="size-4" /></span><span>Tài khoản nhân sự do nhà trường mời và phân công — không đăng ký tự do.</span></li>
          <li className="hidden gap-2.5 sm:flex"><span className="icon-tile icon-tile-sm tone-purple !size-8" aria-hidden><ShieldCheck className="size-4" /></span><span>Phụ huynh không cần tài khoản: xem thông tin của con qua đường dẫn riêng.</span></li>
        </ul>
        {children}
        <p className="mt-4 text-[12.5px] text-muted">Tài khoản nhân sự do nhà trường mời. Phụ huynh xem qua đường dẫn riêng.</p>
      </div>
    </aside>
  );
}
