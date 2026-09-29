"use client";
import { use } from "react";
import { SchoolShell } from "@/components/layout/shells";

export default function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <SchoolShell schoolId={schoolId}>{children}</SchoolShell>;
}
