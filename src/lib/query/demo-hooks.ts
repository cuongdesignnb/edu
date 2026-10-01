"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { makeCtx, type Ctx, isRepoError, errorMessage, type RepoError } from "@/lib/repositories/demo-index";
import { onSessionChange, readSession, writeSession, type DemoSession } from "@/lib/demo/session";
import type { Actor } from "@/lib/permissions/can";
import { useToast } from "@/components/ui/toast";
import { demoNowISO } from "@/lib/demo/clock";

export function useSession() {
  const session = useSyncExternalStore(onSessionChange, readSession, () => null);
  const qc = useQueryClient();
  const signIn = useCallback((actor: Actor, via: DemoSession["via"] = "demo") => {
    qc.clear(); // never leak cached data from a previous actor/context
    writeSession({ actor, startedAt: demoNowISO(), via, expiresAt: undefined });
  }, [qc]);
  const signOut = useCallback(() => {
    qc.clear();
    writeSession(null);
  }, [qc]);
  const expire = useCallback(() => {
    if (!session) return;
    writeSession({ ...session, expiresAt: "2000-01-01T00:00:00+07:00" });
  }, [session]);
  return { session, actor: (session?.actor ?? { kind: "anonymous" }) as Actor, signIn, signOut, expire };
}

export function useCtx(): Ctx {
  const { actor } = useSession();
  return useMemo(() => makeCtx(actor), [actor]);
}

function actorKey(a: Actor) {
  return a.kind === "anonymous" ? "anon" : `${a.kind}:${a.userId}`;
}

/** Read through the mock repository. Errors are typed RepoErrors; no automatic retry (UI offers "Thử lại"). */
export function useRepo<T>(key: readonly unknown[], fn: (ctx: Ctx) => Promise<T>, opts: Omit<UseQueryOptions<T, RepoError>, "queryKey" | "queryFn"> = {}) {
  const { actor } = useSession();
  return useQuery<T, RepoError>({
    queryKey: [actorKey(actor), ...key],
    queryFn: () => fn(makeCtx(actor)),
    retry: false,
    staleTime: 5_000,
    ...opts,
  });
}

export interface CommandOptions<R> {
  success?: string | ((r: R) => string);
  onSuccess?: (r: R) => void;
  onError?: (e: RepoError) => void;
  silentError?: boolean;
}

/**
 * Mutation wrapper: prevents double submission, only toasts success AFTER the local
 * transaction committed, never shows success on failure. Caller keeps its form state.
 */
export function useCommand<A extends unknown[], R>(fn: (ctx: Ctx, ...args: A) => Promise<R>, opts: CommandOptions<R> = {}) {
  const { actor } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RepoError | null>(null);
  const inFlight = useRef(false);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const r = await fn(makeCtx(actor), ...args);
      const o = optsRef.current;
      if (o.success) toast.push({ tone: "success", title: typeof o.success === "function" ? o.success(r) : o.success, detail: "Đã lưu vào dữ liệu demo trên trình duyệt này." });
      await qc.invalidateQueries();
      o.onSuccess?.(r);
      return r;
    } catch (e) {
      const err = (isRepoError(e) ? e : { name: "RepoError", code: "NETWORK", message: errorMessage(e) }) as RepoError;
      setError(err);
      const o = optsRef.current;
      o.onError?.(err);
      if (!o.silentError && err.code !== "VALIDATION" && err.code !== "DUPLICATE" && err.code !== "CONFLICT") {
        toast.push({ tone: "error", title: err.code === "NETWORK" ? "Chưa lưu được" : "Không thực hiện được", detail: err.message });
      }
      return undefined;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [actor, fn, qc, toast]);
  return { run, pending, error, reset: () => setError(null) };
}
