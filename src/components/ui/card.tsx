import Link from "next/link";
import { clsx } from "clsx";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export type PastelTone = "blue" | "green" | "amber" | "pink" | "purple" | "neutral";

/** C031 — card/panel with the reference radius, border and soft shadow. */
export function Card({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "aside"; id?: string; "aria-label"?: string; "aria-labelledby"?: string }) {
  return <As className={clsx("card", className)} {...rest}>{children}</As>;
}

export function CardHeader({ title, icon, action, subtitle, className, id }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; subtitle?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={clsx("card-header", className)}>
      <div className="min-w-0">
        <h2 className="card-title" id={id}>{icon}{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardLink({ href, children = "Xem tất cả" }: { href: string; children?: ReactNode }) {
  return <Link href={href} className="card-link">{children}<ArrowRight className="size-3.5" aria-hidden /></Link>;
}

export function IconTile({ tone = "blue", children, size = "md", className }: { tone?: PastelTone; children: ReactNode; size?: "sm" | "md"; className?: string }) {
  return <span className={clsx("icon-tile", size === "sm" && "icon-tile-sm", `tone-${tone}`, className)} aria-hidden>{children}</span>;
}

export function InfoRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("grid grid-cols-[minmax(110px,40%)_1fr] gap-3 py-1.5 text-sm", className)}>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-ink">{children}</dd>
    </div>
  );
}

export function Callout({ tone = "info", icon, title, children, className, action }: { tone?: "info" | "warning" | "danger" | "success" | "neutral"; icon?: ReactNode; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const map = {
    info: "bg-primary-light border-[#cfe3fb] text-[#0b4c99]",
    warning: "bg-warning-bg border-[#f5d9a6] text-warning-text",
    danger: "bg-danger-bg border-[#f6c9cb] text-danger-text",
    success: "bg-success-bg border-[#bfe8d6] text-success-text",
    neutral: "bg-neutral-bg border-line text-neutral-text",
  };
  return (
    <div className={clsx("flex gap-3 rounded-xl border px-4 py-3 text-[13.5px]", map[tone], className)} role={tone === "danger" ? "alert" : undefined}>
      {icon && <span className="mt-0.5 flex-none [&>svg]:size-[18px]" aria-hidden>{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5", "leading-relaxed")}>{children}</div>}
      </div>
      {action && <div className="flex-none self-center">{action}</div>}
    </div>
  );
}
