"use client";
import { use } from "react";
import { PublicNewsPage } from "@/features/system/public-school";

/** SY02 — public announcement of a school. */
export default function Page({ params }: { params: Promise<{ schoolSlug: string; announcementId: string }> }) {
  const { schoolSlug, announcementId } = use(params);
  return <PublicNewsPage slug={schoolSlug} id={announcementId} />;
}
