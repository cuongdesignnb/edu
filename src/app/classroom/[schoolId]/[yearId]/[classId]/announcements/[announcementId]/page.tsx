"use client";
import { use } from "react";
import { ClassAnnouncementDetailPage } from "@/features/class-comms/announcements";

/** CL23 — Chi tiết thông báo lớp. */
export default function Page({ params }: { params: Promise<{ announcementId: string }> }) {
  const { announcementId } = use(params);
  return <ClassAnnouncementDetailPage announcementId={announcementId} />;
}
