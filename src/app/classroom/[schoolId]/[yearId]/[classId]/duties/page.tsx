"use client";
import { Suspense } from "react";
import { DutyBoard } from "@/features/class-org/duties";

/** CL16 — Lịch trực nhật. ?week=YYYY-MM-DD */
export default function Page() {
  return <Suspense><DutyBoard /></Suspense>;
}
