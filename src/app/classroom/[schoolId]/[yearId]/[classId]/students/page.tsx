"use client";
import { ClassHeader } from "@/features/classroom/context";
import { ClassRoster } from "@/features/class-org/roster";

/** CL02 — Học sinh trong lớp (R06). */
export default function Page() {
  return (
    <div className="page">
      <ClassHeader variant="full" />
      <ClassRoster />
    </div>
  );
}
