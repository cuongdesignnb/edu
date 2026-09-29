"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { DemoScenarioBanner } from "@/components/ui/guards";

/**
 * SY05–SY08 full-page state (P04 style): brand header, one centred card with icon,
 * short code, title, explanation and safe next steps. Never shows technical traces.
 */
export function StatusScreen({ icon, tone = "blue", code, title, description, actions, children, banner = true }: {
  icon: ReactNode; tone?: "blue" | "amber" | "pink" | "purple" | "green" | "neutral"; code?: string; title: string; description: ReactNode; actions?: ReactNode; children?: ReactNode; banner?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-app">
      {banner && <DemoScenarioBanner compact />}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-[68px] max-w-5xl items-center gap-4 px-4">
          <Brand />
          <nav className="ml-auto flex items-center gap-4 text-sm" aria-label="Liên kết">
            <Link href="/help" className="text-body hover:text-primary-strong">Hướng dẫn</Link>
            <Link href="/privacy" className="hidden text-body hover:text-primary-strong sm:inline">Quyền riêng tư</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="card w-full max-w-2xl overflow-hidden">
          <div className="flex flex-col items-center gap-3 bg-gradient-to-b from-[#eef6ff] to-white px-5 pb-2 pt-8 text-center sm:px-10">
            <span className={`icon-tile tone-${tone} !size-16 !rounded-2xl [&>svg]:size-8`} aria-hidden>{icon}</span>
            {code && <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">{code}</p>}
            <h1 className="text-[26px] font-bold leading-tight text-ink">{title}</h1>
            <div className="max-w-lg text-[14.5px] leading-relaxed text-body">{description}</div>
          </div>
          {children && <div className="px-5 pt-4 sm:px-10">{children}</div>}
          {actions && <div className="flex flex-wrap justify-center gap-2 px-5 pb-8 pt-5 sm:px-10">{actions}</div>}
        </div>
      </main>
      <footer className="border-t border-line bg-white/70 px-4 py-4 text-center text-[12.5px] text-muted">EduManage — bản demo dữ liệu giả định. Không hiển thị chi tiết kỹ thuật hay dữ liệu bị chặn.</footer>
    </div>
  );
}
