"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, Images, Network, ListChecks, Component, Activity, Route } from "lucide-react";
import { IS_DEMO } from "@/lib/demo/session";
import { Brand } from "@/components/layout/brand";
import { Badge } from "@/components/ui/badge";
import { DemoScenarioBanner } from "@/components/ui/guards";
import { EmptyState } from "@/components/ui/states";
import { LinkTabs } from "@/components/ui/tabs";

export const LAB_PAGES = [
  { href: "/preview/references", label: "Ảnh tham chiếu", icon: <Images /> },
  { href: "/preview/sitemap", label: "Sitemap", icon: <Network /> },
  { href: "/preview/checklist", label: "Checklist", icon: <ListChecks /> },
  { href: "/preview/components", label: "Component", icon: <Component /> },
  { href: "/preview/states", label: "Trạng thái", icon: <Activity /> },
  { href: "/preview/flows", label: "Luồng demo", icon: <Route /> },
];

/** Internal UI-lab shell: never part of product navigation; disabled outside demo mode. */
export function PreviewShell({ children }: { children: ReactNode }) {
  if (!IS_DEMO) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-app p-4">
        <div className="card w-full max-w-xl">
          <div className="flex justify-center pt-6"><Brand /></div>
          <EmptyState icon={<FlaskConical className="size-6" />} title="Bộ công cụ nghiệm thu đang tắt"
            description="Các trang /preview/* chỉ bật khi ứng dụng chạy ở chế độ demo (NEXT_PUBLIC_APP_MODE=demo). Chúng không thuộc sản phẩm và không có trong menu người dùng." />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <DemoScenarioBanner />
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3">
          <Brand href="/demo" />
          <Badge tone="warning" icon={<FlaskConical className="size-3.5" />}>Nội bộ demo</Badge>
          <span className="hidden text-[12.5px] text-muted md:inline">Bộ công cụ nghiệm thu — không thuộc menu sản phẩm</span>
          <Link href="/demo" className="btn btn-ghost btn-sm ml-auto"><ArrowLeft className="size-4" aria-hidden />Về trang chọn vai trò</Link>
        </div>
        <div className="mx-auto max-w-[1400px] overflow-x-auto px-4 py-2.5">
          <LinkTabs items={LAB_PAGES} exactFirst={false} className="w-max" />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-1 flex-col">{children}</main>
    </div>
  );
}
