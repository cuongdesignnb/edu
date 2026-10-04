"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/query/hooks";
import { PageSkeleton } from "@/components/ui/states";

/** Route to the workspace of the authenticated account. */
export default function Home() {
  const { session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session) router.replace("/login");
    else if (session.actor.kind === "platform") router.replace("/platform");
    else router.replace("/choose-school");
  }, [session, router]);
  return <PageSkeleton />;
}
