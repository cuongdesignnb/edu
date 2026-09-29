"use client";
import { use } from "react";
import { ParentActivityDetailView } from "@/features/parent/views/activities";

export default function Page({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = use(params);
  return <ParentActivityDetailView activityId={decodeURIComponent(activityId)} />;
}
