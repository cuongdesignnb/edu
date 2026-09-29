"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/lib/query/hooks";
import { isExpired } from "@/lib/demo/session";
import { demoNowISO } from "@/lib/demo/clock";
import { AccountShell, PublicShell } from "@/components/layout/shells";
import { PageSkeleton } from "@/components/ui/states";

/** Pages that work with or without a demo session: AccountShell when signed in, PublicShell otherwise. */
export function AdaptiveShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <PageSkeleton />;
  const live = !!session && session.actor.kind !== "anonymous" && !isExpired(session, demoNowISO());
  return live ? <AccountShell>{children}</AccountShell> : <PublicShell><div className="[&>.page]:!p-0">{children}</div></PublicShell>;
}

export function useHasLiveSession() {
  const { session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !!session && session.actor.kind !== "anonymous" && !isExpired(session, demoNowISO());
}
