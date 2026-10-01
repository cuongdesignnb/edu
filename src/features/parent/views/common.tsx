"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ArrowLeft, FileQuestion, Lock, RefreshCw, WifiOff, CalendarX2 } from "lucide-react";
import type { ParentKey, RepoError } from "@/lib/repositories";
import { useParent, useParentRead, unavailableReason } from "@/features/parent/shell";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Tone } from "@/lib/formatters";

/** Stable identity of the current link/preview so cached reads never mix two links or two previews. */
export function keyId(k: ParentKey) {
  return "preview" in k ? `preview:${k.preview.accessId}:${k.preview.ctx.actor.kind === "anonymous" ? "anon" : k.preview.ctx.actor.userId}` : `view:${k.viewId}`;
}

/** useParentRead + an identity segment in the cache key. */
export function usePRead<T>(key: readonly unknown[], fn: (k: ParentKey, slug: string) => Promise<T>) {
  const p = useParent();
  return useParentRead<T>([keyId(p.key), ...key], fn);
}

/** Href inside the parent area (works under /p/:slug and inside the staff preview). */
export function useHref() {
  const { base } = useParent();
  return (path: string) => `${base}/${path}`;
}

export function isModuleError(e: RepoError | null | undefined) {
  return !!e && e.code === "FORBIDDEN" && e.message === "module";
}

/** Friendly state when the school has not shared this module through the link. */
export function ModuleNotShared() {
  const href = useHref();
  return (
    <Card>
      <EmptyState icon={<Lock className="size-6" />} title="Mục này chưa được nhà trường chia sẻ qua link của bạn"
        description="Link riêng chỉ mở những mục nhà trường cho phép. Nếu gia đình cần xem thêm, vui lòng liên hệ giáo viên chủ nhiệm."
        action={<ButtonLink href={href("overview")} size="sm" icon={<ArrowLeft className="size-4" />}>Về trang thông tin của con</ButtonLink>} />
    </Card>
  );
}

/** Parent-side error rendering: never a staff CTA, never another student's data. */
export function ParentError({ error, onRetry, backHref, backLabel = "Quay lại" }: { error: RepoError | null; onRetry?: () => void; backHref?: string; backLabel?: string }) {
  const href = useHref();
  const p = useParent();
  if (isModuleError(error)) return <ModuleNotShared />;
  // Link became unavailable: the hook redirects (outside preview). Keep the screen empty meanwhile.
  if (unavailableReason(error) && !p.preview) return <PageSkeleton variant="parent" />;
  if (error?.code === "NOT_FOUND") {
    return (
      <Card>
        <EmptyState icon={<FileQuestion className="size-6" />} title="Không tìm thấy nội dung" description={error.message || "Nội dung không tồn tại hoặc không dành cho học sinh này."}
          action={<ButtonLink href={backHref ?? href("overview")} size="sm" icon={<ArrowLeft className="size-4" />}>{backHref ? backLabel : "Về trang thông tin của con"}</ButtonLink>} />
      </Card>
    );
  }
  if (error?.code === "FORBIDDEN") {
    return <Card><EmptyState icon={<CalendarX2 className="size-6" />} title="Nằm ngoài phạm vi được xem" description={error.message} action={backHref && <ButtonLink href={backHref} size="sm">{backLabel}</ButtonLink>} /></Card>;
  }
  if (error && unavailableReason(error) && p.preview) {
    return <Card><EmptyState icon={<Lock className="size-6" />} title="Link này hiện không sử dụng được" description="Phụ huynh sẽ thấy trang “Link không sử dụng được”, không có thông tin học sinh." /></Card>;
  }
  return (
    <Card>
      <EmptyState icon={<WifiOff className="size-6" />} title="Không tải được thông tin" description={error?.message ?? "Đã có lỗi khi đọc dữ liệu. Vui lòng thử lại."}
        action={onRetry && <Button variant="primary" size="sm" icon={<RefreshCw className="size-4" />} onClick={onRetry}>Thử lại</Button>} />
    </Card>
  );
}

/** Loading / error / content for parent reads. */
export function PState<T>({ query, skeleton = "parent", children, backHref, backLabel }: {
  query: { data?: T; isLoading: boolean; error: RepoError | null; refetch: () => unknown }; skeleton?: "parent" | "detail" | "table" | "cards"; children: (d: T) => ReactNode; backHref?: string; backLabel?: string;
}) {
  if (query.isLoading) return <PageSkeleton variant={skeleton} />;
  if (query.error) return <ParentError error={query.error} onRetry={() => query.refetch()} backHref={backHref} backLabel={backLabel} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}

/** Page title block for parent pages (no account, no switcher). */
export function ParentHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-[1_1_300px]">
        {back && <Link href={back.href} className="no-print mb-1.5 inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-primary-strong hover:underline"><ArrowLeft className="size-4" aria-hidden />{back.label}</Link>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ParentPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("flex min-w-0 flex-col gap-4 lg:gap-5", className)}>{children}</div>;
}

export const GRADE_TONE = (t?: string): Tone => (t === "success" || t === "warning" || t === "danger" || t === "info" || t === "neutral" || t === "purple" ? t : "info");

export const ACTIVITY_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Đang diễn ra", tone: "info" },
  closed: { label: "Đã kết thúc", tone: "neutral" },
};

export const ACTIVITY_ILLUSTRATION: Record<string, string> = {
  trophy: "/assets/illustrations/activity-trophy.png",
  stem: "/assets/illustrations/activity-stem.png",
  clean: "/assets/illustrations/activity-clean.png",
  book: "/assets/illustrations/books-plant.png",
  heart: "/assets/illustrations/kids-school.png",
};
