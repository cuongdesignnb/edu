"use client";
import { use } from "react";
import { ClassAnnouncementComposePage } from "@/features/class-comms/announcements";

/** CL22 (sửa) — Sửa thông báo lớp. */
export default function Page({ params }: { params: Promise<{ announcementId: string }> }) {
  const { announcementId } = use(params);
  return <ClassAnnouncementComposePage announcementId={announcementId} />;
}
