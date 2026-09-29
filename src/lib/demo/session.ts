"use client";
import type { Actor } from "@/lib/permissions/can";

/**
 * Demo session — NOT authentication. Stored per tab (sessionStorage) with the last
 * choice remembered for new tabs (localStorage). Nothing here is a credential.
 */
export interface DemoSession { actor: Actor; startedAt: string; expiresAt?: string; via: "demo" | "login" | "invitation" }

const TAB_KEY = "edumanage-demo-session";
const LAST_KEY = "edumanage-demo-session-last";
const listeners = new Set<() => void>();
let cache: DemoSession | null | undefined;

function parse(raw: string | null): DemoSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as DemoSession;
    return s && s.actor ? s : null;
  } catch {
    return null;
  }
}

export function readSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  if (cache !== undefined) return cache;
  let s: DemoSession | null = null;
  try {
    s = parse(window.sessionStorage.getItem(TAB_KEY)) ?? parse(window.localStorage.getItem(LAST_KEY));
  } catch {
    s = null;
  }
  cache = s;
  return s;
}

export function writeSession(s: DemoSession | null) {
  cache = s;
  try {
    if (s) {
      window.sessionStorage.setItem(TAB_KEY, JSON.stringify(s));
      window.localStorage.setItem(LAST_KEY, JSON.stringify(s));
    } else {
      window.sessionStorage.removeItem(TAB_KEY);
      window.localStorage.removeItem(LAST_KEY);
    }
  } catch {
    /* storage blocked: session only lives in memory */
  }
  listeners.forEach((l) => l());
}

export function onSessionChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isExpired(s: DemoSession | null, nowIso: string) {
  return !!s?.expiresAt && s.expiresAt < nowIso;
}

/* ------------------------------ Parent link context (per tab) ------------------------------ */
const PARENT_KEY = "edumanage-parent-link";

export function readParentToken(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PARENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { slug: string; token: string };
    return v.slug === slug ? v.token : null;
  } catch {
    return null;
  }
}

export function writeParentToken(slug: string, token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(PARENT_KEY, JSON.stringify({ slug, token }));
    else window.sessionStorage.removeItem(PARENT_KEY);
  } catch {
    /* ignore */
  }
}

export const APP_MODE = process.env.NEXT_PUBLIC_APP_MODE ?? "demo";
export const IS_DEMO = APP_MODE === "demo";
export const ACADEMIC_RESULTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ACADEMIC_RESULTS_PREVIEW === "true";
