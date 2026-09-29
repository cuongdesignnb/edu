"use client";
import { AdaptiveShell } from "@/features/system/adaptive-shell";
import { HelpCenter } from "@/features/system/help-center";

/** AU10 — help centre (works with or without a demo session). */
export default function HelpPage() {
  return <AdaptiveShell><HelpCenter /></AdaptiveShell>;
}
