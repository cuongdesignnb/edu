import type { ID, SupportTicket } from "@/lib/model/types";
import { newId } from "@/lib/demo/ids";
import { matches } from "@/lib/formatters";
import { RepoError } from "./errors";
import { audit, findOr404, paginate, read, requireAction, validation, write, actorId, allowed, type Ctx, type ListQuery } from "./core";
import { staffNameById } from "./selectors";
import { effectiveGrantStatus } from "./platform";

export const SUPPORT_SCOPE_LABEL: Record<string, string> = {
  school_config: "Cấu hình trường (không gồm hồ sơ học sinh)",
  class_structure: "Cấu trúc lớp và phân công",
  staff_directory: "Danh sách nhân sự",
  import_logs: "Nhật ký nhập dữ liệu",
};

/** School-side support: the SCHOOL grants/revokes limited, time-boxed support scopes. */
export const supportRepo = {
  async overview(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "support.manage", { schoolId });
      return {
        tickets: db.tickets.filter((t) => t.schoolId === schoolId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => ({ ...t, createdByName: staffNameById(db, t.createdBy), assigneeName: staffNameById(db, t.assigneeUserId) })),
        grants: db.supportGrants.filter((g) => g.schoolId === schoolId).map((g) => ({ ...g, status: effectiveGrantStatus(g, ctx.now), requestedByName: staffNameById(db, g.requestedBy), approvedByName: staffNameById(db, g.approvedBy) })).sort((a, b) => (b.validFrom ?? b.validTo).localeCompare(a.validFrom ?? a.validTo)),
      };
    });
  },

  async ticket(ctx: Ctx, schoolId: ID, ticketId: ID) {
    return read((db) => {
      requireAction(db, ctx, "support.manage", { schoolId });
      const t = findOr404(db.tickets.find((x) => x.id === ticketId && x.schoolId === schoolId), "yêu cầu hỗ trợ");
      return {
        ticket: t, createdByName: staffNameById(db, t.createdBy), assigneeName: staffNameById(db, t.assigneeUserId),
        updates: t.updates.map((u) => ({ ...u, byName: staffNameById(db, u.by) })),
        grants: db.supportGrants.filter((g) => g.ticketId === t.id).map((g) => ({ ...g, status: effectiveGrantStatus(g, ctx.now), requestedByName: staffNameById(db, g.requestedBy), approvedByName: staffNameById(db, g.approvedBy) })),
      };
    });
  },

  async createTicket(ctx: Ctx, schoolId: ID, input: { title: string; body: string; priority: SupportTicket["priority"] }) {
    return write((db) => {
      requireAction(db, ctx, "support.manage", { schoolId });
      if (input.title.trim().length < 5) validation({ title: "Tiêu đề tối thiểu 5 ký tự" });
      if (input.body.trim().length < 10) validation({ body: "Mô tả tối thiểu 10 ký tự" });
      if (/\b(\d{9,12})\b/.test(input.body)) validation({ body: "Không nhập số giấy tờ/số điện thoại học sinh vào yêu cầu hỗ trợ" });
      const t: SupportTicket = { id: newId("tk"), schoolId, title: input.title.trim(), body: input.body.trim(), priority: input.priority, status: "open", createdBy: actorId(ctx), createdAt: ctx.now, updates: [] };
      db.tickets.push(t);
      audit(db, ctx, { level: "school", schoolId, action: "Tạo yêu cầu hỗ trợ (mô phỏng)", entityType: "ticket", entityId: t.id, entityLabel: t.title });
      return t;
    });
  },

  async addUpdate(ctx: Ctx, schoolId: ID, ticketId: ID, text: string) {
    return write((db) => {
      requireAction(db, ctx, "support.manage", { schoolId });
      const t = findOr404(db.tickets.find((x) => x.id === ticketId && x.schoolId === schoolId), "yêu cầu hỗ trợ");
      if (text.trim().length < 3) validation({ text: "Nội dung tối thiểu 3 ký tự" });
      t.updates.push({ at: ctx.now, by: actorId(ctx), text: text.trim(), side: "school" });
      if (t.status === "waiting_school") t.status = "in_progress";
      return t;
    });
  },

  /** O34 — approve / decline a requested grant, or revoke an active one. */
  async decideGrant(ctx: Ctx, schoolId: ID, grantId: ID, decision: "approve" | "decline" | "revoke") {
    return write((db) => {
      requireAction(db, ctx, "support.manage", { schoolId });
      const g = findOr404(db.supportGrants.find((x) => x.id === grantId && x.schoolId === schoolId), "quyền hỗ trợ");
      const st = effectiveGrantStatus(g, ctx.now);
      if (decision === "revoke") {
        if (st !== "active") throw new RepoError("VALIDATION", "Chỉ thu hồi được quyền đang hiệu lực.");
        g.status = "revoked"; g.revokedAt = ctx.now;
      } else {
        if (st !== "requested") throw new RepoError("VALIDATION", "Đề nghị đã được xử lý hoặc đã hết hạn.");
        g.status = decision === "approve" ? "active" : "declined";
        if (decision === "approve") { g.approvedBy = actorId(ctx); g.validFrom = ctx.now; }
      }
      audit(db, ctx, { level: "school", schoolId, action: decision === "approve" ? "Cho phép hỗ trợ tạm thời" : decision === "decline" ? "Từ chối quyền hỗ trợ" : "Thu hồi quyền hỗ trợ", entityType: "supportGrant", entityId: g.id, entityLabel: g.scopes.map((s) => SUPPORT_SCOPE_LABEL[s]).join(", ") });
      db.audit.push({ id: newId("au"), level: "platform", actorId: actorId(ctx), action: `Nhà trường ${decision === "approve" ? "cho phép" : decision === "decline" ? "từ chối" : "thu hồi"} quyền hỗ trợ`, entityType: "supportGrant", entityId: g.id, entityLabel: db.schools.find((s) => s.id === schoolId)?.shortName ?? "", at: ctx.now });
      return g;
    });
  },

  /* ------------------------------ school audit (read-only) ------------------------------ */
  async audit(ctx: Ctx, schoolId: ID, q: ListQuery) {
    return read((db) => {
      requireAction(db, ctx, "audit.view", { schoolId });
      const f = q.filters ?? {};
      const rows = db.audit.filter((a) => a.level === "school" && a.schoolId === schoolId).map((a) => ({ ...a, actorName: staffNameById(db, a.actorId) }))
        .filter((a) => matches(q.q ?? "", a.action, a.entityLabel, a.actorName, a.reason) && (!f.entityType || a.entityType === f.entityType) && (!f.actor || a.actorId === f.actor) && (!f.from || a.at >= f.from) && (!f.to || a.at <= `${f.to}T23:59:59+07:00`))
        .sort((a, b) => b.at.localeCompare(a.at));
      const all = db.audit.filter((a) => a.level === "school" && a.schoolId === schoolId);
      return {
        ...paginate(rows, q),
        entityTypes: [...new Set(all.map((a) => a.entityType))].sort(),
        actors: [...new Set(all.map((a) => a.actorId))].map((id) => ({ id, name: staffNameById(db, id) })).sort((a, b) => a.name.localeCompare(b.name, "vi")),
        canView: allowed(db, ctx, "audit.view", { schoolId }),
      };
    });
  },
};
