"use client";
import { PreviewShell } from "@/features/preview/shell";

/** /preview/* — internal UI lab ("Nội bộ demo"). Reachable only from /demo and each other. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PreviewShell>{children}</PreviewShell>;
}
