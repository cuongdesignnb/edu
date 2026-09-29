"use client";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-soft" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface Common { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconRight?: ReactNode; loading?: boolean; block?: boolean }

function cls(variant: ButtonVariant = "secondary", size: ButtonSize = "md", block?: boolean, extra?: string) {
  return clsx("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", block && "w-full", extra);
}

/** C011 — primary/secondary/ghost/destructive/loading/disabled. Loading disables to stop double submits. */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & Common>(function Button(
  { variant, size, icon, iconRight, loading, block, className, children, disabled, type = "button", ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={cls(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export function IconButton({ label, icon, variant = "ghost", size = "md", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button type="button" aria-label={label} title={label} className={cls(variant, size, false, clsx("btn-icon", className))} {...rest}>
      {icon}
    </button>
  );
}

export function ButtonLink({ href, variant, size, icon, iconRight, block, className, children, ...rest }: Common & { href: string; className?: string; children: ReactNode; target?: string; prefetch?: boolean }) {
  return (
    <Link href={href} className={cls(variant, size, block, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}
