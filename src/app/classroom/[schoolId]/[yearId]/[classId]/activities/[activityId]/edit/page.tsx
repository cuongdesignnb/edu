"use client";
import { use } from "react";
import { ActivityFormPage } from "@/features/activities/activity-form";

/** CL18 (sửa) — Sửa hoạt động. */
export default function Page({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = use(params);
  return <ActivityFormPage activityId={activityId} />;
}
