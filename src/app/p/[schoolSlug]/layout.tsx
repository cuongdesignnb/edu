"use client";
import { use } from "react";
import { usePathname } from "next/navigation";
import { ParentShell } from "@/features/parent/shell";

/** /p/:schoolSlug — the access and unavailable pages are outside the link gate. */
export default function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ schoolSlug: string }> }) {
  const { schoolSlug } = use(params);
  const pathname = usePathname();
  if (pathname.endsWith("/access") || pathname.endsWith("/access-unavailable")) return <>{children}</>;
  return <ParentShell slug={schoolSlug}>{children}</ParentShell>;
}
