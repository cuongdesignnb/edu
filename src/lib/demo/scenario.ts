/**
 * Deterministic demo scenarios (no Math.random). Controlled from /demo and /preview/states.
 *  - write: "normal" | "fail-next" (next write fails as network error) | "offline" (all writes fail)
 *           | "conflict-next" (next write hits a version conflict)
 *  - read:  "normal" | "error-next" (next read fails) | "slow" (long latency to show skeletons)
 */
export type WriteMode = "normal" | "fail-next" | "offline" | "conflict-next";
export type ReadMode = "normal" | "error-next" | "slow";
export interface Scenario { write: WriteMode; read: ReadMode; latencyMs: number }

const KEY = "edumanage-demo-scenario";
const DEFAULT: Scenario = { write: "normal", read: "normal", latencyMs: 180 };
const listeners = new Set<() => void>();
// Outside a browser (unit tests) scenarios live in memory with zero latency.
let memory: Scenario = { ...DEFAULT, latencyMs: 0 };

export function getScenario(): Scenario {
  if (typeof window === "undefined") return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setScenario(patch: Partial<Scenario>) {
  const next = { ...getScenario(), ...patch };
  if (typeof window === "undefined") memory = next;
  else {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

export function onScenarioChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Consume a one-shot write failure. Returns the failure kind to simulate, if any. */
export function takeWriteFailure(): "network" | "conflict" | null {
  const s = getScenario();
  if (s.write === "offline") return "network";
  if (s.write === "fail-next") { setScenario({ write: "normal" }); return "network"; }
  if (s.write === "conflict-next") { setScenario({ write: "normal" }); return "conflict"; }
  return null;
}

export function takeReadFailure(): boolean {
  const s = getScenario();
  if (s.read === "error-next") { setScenario({ read: "normal" }); return true; }
  return false;
}

export function readLatency(): number {
  const s = getScenario();
  return s.read === "slow" ? 2200 : s.latencyMs;
}
