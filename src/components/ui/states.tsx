"use client";
import Link from "next/link";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Inbox, SearchX, WifiOff, ShieldOff, FileQuestion, RefreshCw, Lock, Clock3, Link2Off, School } from "lucide-react";
import type { RepoError } from "@/lib/repositories";
import { Button, ButtonLink } from "./button";

/* ------------------------------ ST01 Loading ------------------------------ */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden />;
}

/** C042 — skeleton matching the layout (no spinner forever). */
export function PageSkeleton({ variant = "dashboard" }: { variant?: "dashboard" | "table" | "form" | "cards" | "parent" | "detail" }) {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Đang tải dữ liệu…</span>
      <div className="space-y-2"><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      {variant === "dashboard" && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[14px]" />)}</div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]"><Skeleton className="h-80 rounded-[14px]" /><Skeleton className="h-80 rounded-[14px]" /></div>
        </>
      )}
      {variant === "table" && <div className="card p-4 space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>}
      {variant === "form" && <div className="card p-5 grid gap-4 md:grid-cols-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
      {variant === "cards" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44 rounded-[14px]" />)}</div>}
      {variant === "parent" && <div className="grid gap-4 md:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-[14px]" />)}</div>}
      {variant === "detail" && <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"><Skeleton className="h-96 rounded-[14px]" /><Skeleton className="h-96 rounded-[14px]" /></div>}
    </div>
  );
}

/* ------------------------------ ST02 / ST03 Empty ------------------------------ */
export function EmptyState({ title, description, action, icon, compact, className }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <span className="icon-tile tone-blue mb-3" aria-hidden>{icon ?? <Inbox className="size-6" />}</span>
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <div className="mt-1 max-w-md text-sm text-muted">{description}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** C036 — distinguishes "no records yet" from "filters matched nothing" (keeps filters, offers reset). */
export function EmptyFiltered({ onReset, what = "kết quả" }: { onReset: () => void; what?: string }) {
  return <EmptyState compact icon={<SearchX className="size-6" />} title={`Không có ${what} khớp bộ lọc`} description="Bộ lọc hiện tại vẫn được giữ. Hãy đổi điều kiện hoặc xóa bộ lọc." action={<Button variant="secondary" size="sm" onClick={onReset}>Xóa bộ lọc</Button>} />;
}

/* ------------------------------ ST04 / ST09 / ST26 / ST28 errors ------------------------------ */
export function ErrorState({ error, onRetry, compact }: { error: RepoError | Error | null | undefined; onRetry?: () => void; compact?: boolean }) {
  const code = (error as RepoError | undefined)?.code;
  if (code === "FORBIDDEN") return <DeniedState compact={compact} message={error?.message} />;
  if (code === "REVOKED") return <DeniedState compact={compact} revoked message={error?.message} />;
  if (code === "SUSPENDED") return <SuspendedState compact={compact} />;
  if (code === "NO_SESSION") return <EmptyState compact={compact} icon={<Clock3 className="size-6" />} title="Phiên đã hết hoặc chưa đăng nhập" description="Hãy đăng nhập lại bằng tài khoản nhân sự được nhà trường mời." action={<ButtonLink href="/login" variant="primary" size="sm">Đăng nhập</ButtonLink>} />;
  if (code === "NOT_FOUND") return <EmptyState compact={compact} icon={<FileQuestion className="size-6" />} title="Không tìm thấy" description={error?.message ?? "Dữ liệu không tồn tại hoặc không thuộc phạm vi của bạn."} action={<ButtonLink href="/" size="sm">Về trang chính</ButtonLink>} />;
  return (
    <EmptyState compact={compact} icon={<WifiOff className="size-6" />} title="Không tải được dữ liệu" description={error?.message ?? "Đã có lỗi khi đọc dữ liệu. Nội dung bạn đang nhập (nếu có) vẫn được giữ."}
      action={onRetry && <Button variant="primary" size="sm" icon={<RefreshCw className="size-4" />} onClick={onRetry}>Thử lại</Button>} />
  );
}

export function DeniedState({ message, revoked, compact }: { message?: string; revoked?: boolean; compact?: boolean }) {
  return (
    <EmptyState compact={compact} icon={revoked ? <Lock className="size-6" /> : <ShieldOff className="size-6" />}
      title={revoked ? "Quyền truy cập đã thay đổi" : "Bạn không có quyền xem mục này"}
      description={<>{message ?? "Mục này nằm ngoài phạm vi được nhà trường phân công cho bạn."} Nếu cần, hãy liên hệ đầu mối quản trị của trường — không thể tự nâng quyền.</>}
      action={<><ButtonLink href="/choose-school" size="sm">Chọn không gian hợp lệ</ButtonLink><ButtonLink href="/account/no-access" size="sm" variant="ghost">Tìm hiểu thêm</ButtonLink></>} />
  );
}

export function SuspendedState({ compact }: { compact?: boolean }) {
  return <EmptyState compact={compact} icon={<School className="size-6" />} title="Trường đang tạm dừng hoặc đã lưu trữ" description="Thao tác nghiệp vụ tạm khóa. Dữ liệu không bị xóa. Đây là quyết định vận hành, không liên quan thanh toán." action={<ButtonLink href="/school-suspended" size="sm">Xem giải thích</ButtonLink>} />;
}

export function LinkUnavailable({ reason }: { reason: string }) {
  return <EmptyState icon={<Link2Off className="size-6" />} title="Đường dẫn không sử dụng được" description={reason} />;
}

/** Render loading / error / content for a query result. */
export function QueryState<T>({ query, skeleton = "dashboard", children, compactError }: { query: { data?: T; isLoading: boolean; error: RepoError | null; refetch: () => unknown }; skeleton?: Parameters<typeof PageSkeleton>[0]["variant"] | "none"; children: (data: T) => ReactNode; compactError?: boolean }) {
  if (query.isLoading) return skeleton === "none" ? <div aria-busy="true" className="p-6"><Skeleton className="h-24" /></div> : <PageSkeleton variant={skeleton} />;
  if (query.error) return <div className={compactError ? "" : "page"}><div className={compactError ? "" : "card"}><ErrorState error={query.error} onRetry={() => query.refetch()} compact={compactError} /></div></div>;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="font-semibold text-primary-strong hover:underline">{children}</Link>;
}
