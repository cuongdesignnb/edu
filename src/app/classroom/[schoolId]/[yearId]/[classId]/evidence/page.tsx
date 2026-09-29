"use client";
import { Suspense } from "react";
import { EvidencePage } from "@/features/activities/evidence-page";

/** CL20 — Minh chứng của lớp. */
export default function Page() {
  return <Suspense><EvidencePage /></Suspense>;
}
