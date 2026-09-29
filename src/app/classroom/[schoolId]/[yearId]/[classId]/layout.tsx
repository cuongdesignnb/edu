"use client";
import { use } from "react";
import { ClassroomLayout } from "@/features/classroom/context";

export default function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ schoolId: string; yearId: string; classId: string }> }) {
  const { schoolId, yearId, classId } = use(params);
  return <ClassroomLayout schoolId={schoolId} yearId={yearId} classId={classId}>{children}</ClassroomLayout>;
}
