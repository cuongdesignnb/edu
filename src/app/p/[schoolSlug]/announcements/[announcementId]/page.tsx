"use client";
import { use } from "react";
import { ParentAnnouncementDetailView } from "@/features/parent/views/announcements";

export default function Page({ params }: { params: Promise<{ announcementId: string }> }) {
  const { announcementId } = use(params);
  return <ParentAnnouncementDetailView announcementId={decodeURIComponent(announcementId)} />;
}
