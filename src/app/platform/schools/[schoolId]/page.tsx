"use client";
import { use } from "react";
import { SchoolProfile } from "@/features/platform/school-profile";

/** PL04 — operational school profile. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return <SchoolProfile schoolId={schoolId} />;
}
