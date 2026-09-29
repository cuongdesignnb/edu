"use client";
import { use } from "react";
import { PublicationDetailScreen } from "@/features/conduct/publications";

/** CL10 — Bản kết quả đã công bố (snapshot bất biến). */
export default function Page({ params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = use(params);
  return <PublicationDetailScreen snapshotId={publicationId} />;
}
