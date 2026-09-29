/**
 * Local demo store: one typed DemoDB persisted in IndexedDB (namespace
 * edumanage-ui-demo-v1) and synchronised between tabs of the SAME origin via
 * BroadcastChannel. This is not multi-device sync and not a backend.
 */
import { createStore, get, set, del } from "idb-keyval";
import type { DemoDB } from "@/lib/model/types";
import { buildSeed } from "@/lib/fixtures/seed";

const NS = "edumanage-ui-demo-v1";
const DB_KEY = "db";

let idb: ReturnType<typeof createStore> | null = null;
function store() {
  if (!idb) idb = createStore(NS, "kv");
  return idb;
}

let current: DemoDB | null = null;
let loading: Promise<DemoDB> | null = null;
let channel: BroadcastChannel | null = null;
const listeners = new Set<(source: "local" | "remote") => void>();

function hasIDB() {
  return typeof indexedDB !== "undefined";
}

export async function initStore(): Promise<DemoDB> {
  if (current) return current;
  if (loading) return loading;
  loading = (async () => {
    let db: DemoDB | undefined;
    if (hasIDB()) {
      try {
        db = await get<DemoDB>(DB_KEY, store());
      } catch {
        db = undefined;
      }
    }
    if (!db || db.meta?.schema !== "edumanage-ui-demo-v1") {
      db = buildSeed();
      await persist(db);
    }
    current = db;
    setupChannel();
    return db;
  })();
  return loading;
}

function setupChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(NS);
  channel.onmessage = async (ev) => {
    if (ev.data?.type === "db-changed" || ev.data?.type === "db-reset") {
      const fresh = hasIDB() ? await get<DemoDB>(DB_KEY, store()) : undefined;
      if (fresh) current = fresh;
      listeners.forEach((l) => l("remote"));
    }
  };
}

async function persist(db: DemoDB) {
  if (!hasIDB()) return;
  await set(DB_KEY, db, store());
}

export function getDB(): DemoDB {
  if (!current) throw new Error("Demo store not initialised");
  return current;
}

export function isReady() {
  return current !== null;
}

/**
 * Apply a mutation atomically: run it on a clone, persist, then swap and notify.
 * If the mutator throws, nothing changes.
 */
export async function commit<T>(mutator: (draft: DemoDB) => T): Promise<T> {
  const base = getDB();
  const draft = structuredClone(base);
  const result = mutator(draft);
  draft.meta.revision = base.meta.revision + 1;
  await persist(draft);
  current = draft;
  channel?.postMessage({ type: "db-changed", revision: draft.meta.revision });
  listeners.forEach((l) => l("local"));
  return result;
}

export async function resetStore(): Promise<void> {
  const seed = buildSeed();
  if (hasIDB()) {
    await del(DB_KEY, store());
    await set(DB_KEY, seed, store());
  }
  current = seed;
  channel?.postMessage({ type: "db-reset" });
  listeners.forEach((l) => l("local"));
}

export function subscribe(fn: (source: "local" | "remote") => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ------------------------------ Blobs (uploaded demo files) ------------------------------ */
export async function putBlob(key: string, blob: Blob) {
  if (hasIDB()) await set(`blob:${key}`, blob, store());
}
export async function getBlob(key: string): Promise<Blob | undefined> {
  if (!hasIDB()) return undefined;
  return get<Blob>(`blob:${key}`, store());
}

/** Test helper: load an explicit db (no IndexedDB needed). */
export function __setDBForTests(db: DemoDB) {
  current = db;
}
