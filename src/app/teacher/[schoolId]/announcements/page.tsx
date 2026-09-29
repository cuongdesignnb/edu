"use client";
import { use } from "react";
import { TeacherAnnouncements } from "@/features/teacher/announcements";

/** TE05 — Thông báo dành cho giáo viên. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <TeacherAnnouncements schoolId={schoolId} />;
}
