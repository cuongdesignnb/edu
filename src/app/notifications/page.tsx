"use client";
import { Suspense } from "react";
import { NotificationsCenter } from "@/features/auth/notifications-center";
import { PageSkeleton } from "@/components/ui/states";

/** AU09 — staff notification centre. */
export default function Page() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><NotificationsCenter /></Suspense>;
}
