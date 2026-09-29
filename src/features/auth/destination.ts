import type { Actor } from "@/lib/permissions/can";
import { makeCtx, sessionRepo } from "@/lib/repositories";

/**
 * Where a freshly signed-in actor should land:
 * platform → /platform; exactly one usable workspace → that workspace; otherwise /choose-school.
 */
export async function destinationFor(actor: Actor): Promise<string> {
  if (actor.kind === "platform") return "/platform";
  if (actor.kind !== "staff") return "/login";
  const me = await sessionRepo.me(makeCtx(actor));
  const live = me.workspaces.filter((w) => w.membershipStatus === "active" && w.school.status === "active" && (w.schoolWorkspace || w.teacherWorkspace));
  if (live.length === 1) return live[0].schoolWorkspace ? `/school/${live[0].school.id}` : `/teacher/${live[0].school.id}`;
  return "/choose-school";
}
