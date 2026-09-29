"use client";
import { use } from "react";
import { ActivityDetailPage } from "@/features/activities/activity-detail";

/** CL19 — Chi tiết hoạt động. */
export default function Page({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = use(params);
  return <ActivityDetailPage activityId={activityId} />;
}
