"use client";
import { use } from "react";
import { announcementsRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { QueryState } from "@/components/ui/states";
import { AnnouncementDetailView } from "@/features/announcements/detail";

/** SC35 — Chi tiết thông báo trường. */
export default function Page({ params }: { params: Promise<{ schoolId: string; announcementId: string }> }) {
  const { schoolId, announcementId } = use(params);
  const q = useRepo(["announcement", schoolId, announcementId], (c) => announcementsRepo.detail(c, schoolId, announcementId));
  return <QueryState query={q} skeleton="detail">{(a) => <AnnouncementDetailView schoolId={schoolId} a={a} />}</QueryState>;
}
