"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/query/hooks";
import { PageSkeleton } from "@/components/ui/states";
import { IS_DEMO } from "@/lib/data-mode";

/** Root: route to the right workspace for the current demo session. */
export default function Home() {
  const { session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session) router.replace(IS_DEMO ? "/demo" : "/login");
    else if (session.actor.kind === "platform") router.replace("/platform");
    else router.replace("/choose-school");
  }, [session, router]);
  return <PageSkeleton />;
}
