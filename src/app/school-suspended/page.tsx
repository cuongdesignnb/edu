"use client";
import { Suspense } from "react";
import { SchoolSuspended } from "@/features/system/system-pages";

/** SY06 — school suspended. */
export default function Page() {
  return <Suspense fallback={null}><SchoolSuspended /></Suspense>;
}
