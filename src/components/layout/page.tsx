import Link from "next/link";
import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "./brand";

/** C005 — breadcrumbs with friendly labels (never raw technical ids). */
export function Breadcrumbs({ items, className }: { items: { label: string; href?: string }[]; className?: string }) {
  return (
    <nav aria-label="Đường dẫn" className={clsx("text-[13px] text-muted", className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
            {it.href && i < items.length - 1 ? <Link href={it.href} className="hover:text-primary-strong hover:underline">{it.label}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined} className={i === items.length - 1 ? "font-semibold text-ink" : undefined}>{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * C006 — page header with the reference look: big navy title, subtitle, italic quote and
 * a decorative illustration on wide screens (hidden on phones to save space).
 */
export function PageHeader({ title, subtitle, quote, illustration, actions, breadcrumbs, children, badge, compact }: {
  title: ReactNode; subtitle?: ReactNode; quote?: [string, string?]; illustration?: string; actions?: ReactNode; breadcrumbs?: { label: string; href?: string }[]; children?: ReactNode; badge?: ReactNode; compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className={clsx("flex flex-wrap items-start gap-4", compact ? "min-h-0" : "lg:min-h-[96px]")}>
        <div className="min-w-0 flex-[1_1_320px]">
          {breadcrumbs && <Breadcrumbs items={breadcrumbs} className="mb-1.5" />}
          <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">{title}</h1>{badge}</div>
          {subtitle && <p className="page-subtitle mt-1">{subtitle}</p>}
        </div>
        {(quote || illustration) && (
          <div className="no-print hidden flex-none items-center gap-3 xl:flex" aria-hidden>
            {quote && <p className="quote max-w-[300px] text-right">“{quote[0]}{quote[1] && <><br />{quote[1]}</>}”</p>}
            {illustration && <img src={illustration} alt="" className="h-[92px] w-auto [mask-image:linear-gradient(to_right,transparent,black_18%)]" />}
          </div>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** C010 — footer (links are real routes). Parent/public footers pass their own content. */
export function AppFooter() {
  return (
    <footer className="no-print mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line bg-white/60 px-5 py-4 text-[13px] text-muted">
      <div className="flex items-center gap-3"><Brand compact href="/" /><div><p className="font-bold text-ink">EduManage</p><p className="text-[12px]">Nền tảng quản lý trường học</p></div></div>
      <nav className="ml-auto flex flex-wrap gap-x-4 gap-y-1" aria-label="Liên kết chân trang">
        <Link href="/terms" className="hover:text-primary-strong">Điều khoản sử dụng</Link>
        <Link href="/privacy" className="hover:text-primary-strong">Chính sách quyền riêng tư</Link>
        <Link href="/help" className="hover:text-primary-strong">Hướng dẫn & hỗ trợ</Link>
        <span>© 2026 EduManage</span>
      </nav>
    </footer>
  );
}
