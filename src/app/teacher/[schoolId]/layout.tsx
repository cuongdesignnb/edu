"use client";
import { use } from "react";
import { TeacherShell } from "@/components/layout/shells";

export default function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <TeacherShell schoolId={schoolId}>{children}</TeacherShell>;
}
