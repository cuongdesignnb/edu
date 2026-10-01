"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LogIn } from "lucide-react";
import { useSession } from "@/lib/query/demo-hooks";
import { writeParentToken } from "@/lib/demo/session";
import type { Persona } from "@/lib/routing/registry";
import { Button } from "@/components/ui/button";

/** Parent links from the fixture (docs/build-brief-common.md). */
export const PARENT_LINKS = {
  me: { slug: "binh-minh", token: "demo-minhanh-me", label: "Mẹ Minh Anh" },
  bo: { slug: "binh-minh", token: "demo-minhanh-bo", label: "Bố Minh Anh" },
  expired: { slug: "binh-minh", token: "demo-expired", label: "Link hết hạn" },
  revoked: { slug: "binh-minh", token: "demo-revoked", label: "Link đã thu hồi" },
  limited: { slug: "binh-minh", token: "demo-limited", label: "Link chỉ 2 mục" },
  suspended: { slug: "tran-phu", token: "demo-truong-tam-dung", label: "Trường tạm dừng" },
  anhoa: { slug: "an-hoa", token: "demo-anhoa-01", label: "Trường B — An Hòa" },
} as const;

export const accessHref = (slug: string, token: string) => `/p/${slug}/access?t=${encodeURIComponent(token)}`;

/**
 * Switch to the right demo persona first, then open the route.
 *  - staff / platform → signIn (clears query cache) then navigate in this tab
 *  - parent → new tab. The access page is opened directly; for any other parent page the
 *    link context is written to sessionStorage right before window.open so the new tab
 *    inherits it (same-origin tabs opened by script copy sessionStorage), then removed here.
 *  - public → navigate only
 */
export function useOpenAs() {
  const { signIn } = useSession();
  const router = useRouter();
  return useCallback((persona: Persona, href: string) => {
    if (persona.kind === "parent") {
      if (href.includes("/access")) { writeParentToken(persona.slug, null); window.open(href, "_blank", "noopener"); return; }
      writeParentToken(persona.slug, persona.token);
      window.open(href, "_blank");
      window.setTimeout(() => writeParentToken(persona.slug, null), 1500);
      return;
    }
    if (persona.kind === "platform" || persona.kind === "staff") signIn({ kind: persona.kind, userId: persona.userId }, "demo");
    router.push(href);
  }, [router, signIn]);
}

export function OpenButton({ persona, href, label = "Mở", size = "sm", variant = "secondary", disabled }: { persona: Persona; href: string; label?: string; size?: "sm" | "md"; variant?: "primary" | "secondary" | "ghost"; disabled?: boolean }) {
  const open = useOpenAs();
  const isParent = persona.kind === "parent";
  return (
    <Button size={size} variant={variant} disabled={disabled} icon={isParent ? <ExternalLink className="size-4" /> : <LogIn className="size-4" />}
      title={isParent ? "Mở trong tab mới bằng link phụ huynh demo" : persona.kind === "public" ? "Mở trang" : `Đổi vai trò demo sang ${persona.userId} rồi mở`}
      onClick={() => open(persona, href)}>
      {label}
    </Button>
  );
}
