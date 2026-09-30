import type { ActionKey, AuditEvent, DemoDB, ID } from "@/lib/model/types";
import { can, decide, type Actor, type Scope } from "@/lib/permissions/can";
import { demoNowISO, demoToday } from "@/lib/demo/clock";
import { readLatency, takeReadFailure, takeWriteFailure } from "@/lib/demo/scenario";
import { newId } from "@/lib/demo/ids";
import { RepoError } from "./errors";
import { commit, getDB, initStore } from "./store";

export interface Ctx { actor: Actor; today: string; now: string; staffOwner?:{epoch:number;assertCurrent:()=>void} }

export function makeCtx(actor: Actor): Ctx {
  return { actor, today: demoToday(), now: demoNowISO() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Async read with deterministic scenario latency / failure. Results are cloned (read-only for UI). */
export async function read<T>(fn: (db: DemoDB) => T): Promise<T> {
  await initStore();
  await sleep(readLatency());
  if (takeReadFailure()) throw new RepoError("READ_ERROR");
  const out = fn(getDB());
  return out === undefined ? out : structuredClone(out);
}

/**
 * Async write. The scenario may simulate a network error (nothing saved) or a
 * version conflict. Success resolves only after the local transaction commits.
 */
export async function write<T>(fn: (draft: DemoDB) => T): Promise<T> {
  await initStore();
  await sleep(Math.min(readLatency(), 400) + 120);
  const failure = takeWriteFailure();
  if (failure === "network") throw new RepoError("NETWORK");
  if (failure === "conflict") throw new RepoError("CONFLICT", undefined, { details: { simulated: true } });
  const out = await commit(fn);
  return out === undefined ? out : structuredClone(out);
}

export function requireStaff(ctx: Ctx): ID {
  if (ctx.actor.kind !== "staff") throw new RepoError(ctx.actor.kind === "anonymous" ? "NO_SESSION" : "FORBIDDEN");
  return ctx.actor.userId;
}

export function requirePlatform(ctx: Ctx): ID {
  if (ctx.actor.kind !== "platform") throw new RepoError("FORBIDDEN", "Chỉ tài khoản vận hành nền tảng được thực hiện thao tác này.");
  return ctx.actor.userId;
}

export function actorId(ctx: Ctx): ID {
  return ctx.actor.kind === "anonymous" ? "anonymous" : ctx.actor.userId;
}

/** Throws a typed error that the UI maps to denied / suspended / revoked states. */
export function requireAction(db: DemoDB, ctx: Ctx, action: ActionKey, scope: Scope) {
  const d = decide(db, ctx.actor, action, scope, ctx.today);
  if (d.allowed) return;
  if (d.reason === "school_inactive") throw new RepoError("SUSPENDED");
  if (d.reason === "not_member") {
    const m = ctx.actor.kind === "staff" ? db.memberships.find((x) => x.userId === (ctx.actor as { userId: string }).userId && x.schoolId === scope.schoolId) : undefined;
    if (m && m.status !== "active") throw new RepoError("REVOKED", "Thành viên của bạn tại trường này đã bị tạm khóa hoặc thu hồi.");
  }
  if (d.reason === "anonymous") throw new RepoError("NO_SESSION");
  throw new RepoError("FORBIDDEN");
}

export function allowed(db: DemoDB, ctx: Ctx, action: ActionKey, scope: Scope) {
  return can(db, ctx.actor, action, scope, ctx.today);
}

export function requireAnyAction(db: DemoDB, ctx: Ctx, actions: ActionKey[], scope: Scope) {
  if (actions.some((a) => allowed(db, ctx, a, scope))) return;
  requireAction(db, ctx, actions[0], scope);
}

export function checkVersion(current: { version: number }, expected: number | undefined) {
  if (expected !== undefined && current.version !== expected) {
    throw new RepoError("CONFLICT", undefined, { details: { current: current.version, expected } });
  }
}

export function audit(db: DemoDB, ctx: Ctx, e: Omit<AuditEvent, "id" | "at" | "actorId">) {
  db.audit.push({ id: newId("au"), at: ctx.now, actorId: actorId(ctx), ...e });
}

export function findOr404<T>(item: T | undefined, what = "dữ liệu"): T {
  if (!item) throw new RepoError("NOT_FOUND", `Không tìm thấy ${what} hoặc ${what} không thuộc phạm vi của bạn.`);
  return item;
}

export function validation(fieldErrors: Record<string, string>): never {
  throw new RepoError("VALIDATION", undefined, { fieldErrors });
}

/* ------------------------------ Pagination / listing helpers ------------------------------ */
export interface ListQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
  filters?: Record<string, string | undefined>;
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; pageCount: number; allIds: ID[] }

/** Real filtering/paging over the result set; `allIds` lets bulk actions select all filtered results. */
export function paginate<T extends { id: ID }>(rows: T[], q: ListQuery, sorters: Record<string, (a: T, b: T) => number> = {}): Page<T> {
  const pageSize = q.pageSize ?? 10;
  let sorted = rows;
  if (q.sort && sorters[q.sort]) {
    sorted = [...rows].sort(sorters[q.sort]);
    if (q.dir === "desc") sorted.reverse();
  }
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, q.page ?? 1), pageCount);
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pageCount, allIds: sorted.map((r) => r.id) };
}
