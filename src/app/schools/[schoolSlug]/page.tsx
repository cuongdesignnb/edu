"use client";
import { use } from "react";
import { PublicSchoolPage } from "@/features/system/public-school";

/** SY01 — public school page. */
export default function Page({ params }: { params: Promise<{ schoolSlug: string }> }) {
  const { schoolSlug } = use(params);
  return <PublicSchoolPage slug={schoolSlug} />;
}
