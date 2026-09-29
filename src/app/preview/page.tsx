"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageSkeleton } from "@/components/ui/states";

/** /preview has no content of its own — go to the first lab page. */
export default function Page() {
  const router = useRouter();
  useEffect(() => { router.replace("/preview/references"); }, [router]);
  return <PageSkeleton variant="cards" />;
}
