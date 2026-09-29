import type { ID, SupportTicket } from "@/lib/model/types";
import { addMinutesISO } from "@/lib/demo/clock";
import { RepoError } from "./errors";
import { audit, findOr404, read, requirePlatform, validation, write, type Ctx } from "./core";
import { staffNameById } from "./selectors";
import { effectiveGrantStatus } from "./platform";
import { effectiveInvitationStatus } from "./session";

/**
 * Extra read/write functions for the auth-platform-system group (AU*, PL*, SY*).
 * Everything here is a local demo: no email is sent, no password is stored or checked,
 * no backup/restore runs on any server.
 */

export type ServiceState = "operational" | "degraded" | "maintenance";

export interface OperationsView {
  simulated: true;
  checkedAt: string;
  services: { key: string; name: string; description: string; state: ServiceState; note: string }[];
  backups: { id: string; at: string; kind: "daily" | "weekly"; state: "completed_simulated"; retention: string }[];
  store: { schema: string; seededAt: string; revision: number; schools: number; users: number; auditEvents: number };
  checklist: { key: string; label: string; count: number; tone: "ok" | "attention"; href: string; hint: string }[];
}

export const platformExtraRepo = {
  /** PL10 — simulated service status + a real checklist derived from the demo data. */
  async operations(ctx: Ctx): Promise<OperationsView> {
    requirePlatform(ctx);
    return read((db) => {
      const soon = addMinutesISO(ctx.now, 3 * 1440);
      const adminRole = (sid: string) => `${sid}-role-admin`;
      const activeWithoutAdmin = db.schools.filter((s) => s.status === "active" && !db.memberships.some((m) => m.schoolId === s.id && m.status === "active" && m.roleTemplateIds.includes(adminRole(s.id))));
      const drafts = db.schools.filter((s) => s.status === "draft");
      const pendingInv = db.invitations.filter((i) => effectiveInvitationStatus(i, ctx.now) === "pending" && i.roleTemplateIds.some((r) => r.endsWith("-role-admin")));
      const expiringInv = pendingInv.filter((i) => i.expiresAt <= soon);
      const highTickets = db.tickets.filter((t) => t.priority === "high" && t.status !== "resolved");
      const unassigned = db.tickets.filter((t) => !t.assigneeUserId && t.status !== "resolved");
      const activeGrants = db.supportGrants.filter((g) => effectiveGrantStatus(g, ctx.now) === "active");
      const requestedGrants = db.supportGrants.filter((g) => effectiveGrantStatus(g, ctx.now) === "requested");
      const day = (n: number, hh: string) => `${addMinutesISO(ctx.now, -n * 1440).slice(0, 10)}T${hh}:00+07:00`;
      return {
        simulated: true,
        checkedAt: ctx.now,
        services: [
          { key: "web", name: "Ứng dụng web", description: "Giao diện nhân sự, nhà trường, giáo viên", state: "operational", note: "Chạy cục bộ trên trình duyệt (bản demo)." },
          { key: "data", name: "Kho dữ liệu demo", description: "IndexedDB trên trình duyệt này", state: "operational", note: "Không phải cơ sở dữ liệu máy chủ." },
          { key: "parent", name: "Cổng phụ huynh qua link", description: "Trang chỉ đọc dữ liệu đã công bố", state: "operational", note: "Link demo, không phải token production." },
          { key: "files", name: "Lưu trữ tệp", description: "Tệp minh chứng, tài liệu", state: "degraded", note: "Tệp chỉ lưu cục bộ; chưa kết nối kho lưu trữ thật." },
          { key: "notify", name: "Gửi email / tin nhắn", description: "Lời mời, thông báo ngoài hệ thống", state: "maintenance", note: "Chưa kết nối. Lời mời chỉ tạo link demo, không gửi email." },
        ],
        backups: [1, 2, 3, 7].map((n, i) => ({ id: `bk-${n}`, at: day(n, "02:00"), kind: i === 3 ? "weekly" as const : "daily" as const, state: "completed_simulated" as const, retention: i === 3 ? "Giữ 8 tuần (quy trình dự kiến)" : "Giữ 14 ngày (quy trình dự kiến)" })),
        store: { schema: db.meta.schema, seededAt: db.meta.seededAt, revision: db.meta.revision, schools: db.schools.length, users: db.users.length, auditEvents: db.audit.length },
        checklist: [
          { key: "no-admin", label: "Trường đang hoạt động chưa có quản trị", count: activeWithoutAdmin.length, tone: activeWithoutAdmin.length ? "attention" : "ok", href: "/platform/schools", hint: activeWithoutAdmin.map((s) => s.shortName).join(", ") || "Mọi trường đang hoạt động đều có quản trị." },
          { key: "drafts", label: "Trường chờ kích hoạt", count: drafts.length, tone: drafts.length ? "attention" : "ok", href: "/platform/schools", hint: drafts.map((s) => s.shortName).join(", ") || "Không có trường nháp." },
          { key: "inv", label: "Lời mời quản trị sắp hết hạn (3 ngày)", count: expiringInv.length, tone: expiringInv.length ? "attention" : "ok", href: "/platform/schools", hint: `${pendingInv.length} lời mời quản trị đang chờ.` },
          { key: "tickets-high", label: "Yêu cầu hỗ trợ ưu tiên cao chưa xong", count: highTickets.length, tone: highTickets.length ? "attention" : "ok", href: "/platform/support", hint: highTickets.map((t) => t.title).join("; ") || "Không có." },
          { key: "tickets-unassigned", label: "Yêu cầu chưa phân công", count: unassigned.length, tone: unassigned.length ? "attention" : "ok", href: "/platform/support", hint: "Phân công người xử lý trong mục Yêu cầu hỗ trợ." },
          { key: "grants", label: "Quyền hỗ trợ đang hiệu lực", count: activeGrants.length, tone: "ok", href: "/platform/support-access", hint: `${requestedGrants.length} đề nghị đang chờ nhà trường cho phép.` },
        ],
      };
    });
  },

  /** PL03 — live duplicate check for code/slug (the create call validates again). */
  async checkSchoolIdentity(ctx: Ctx, code: string, slug: string) {
    requirePlatform(ctx);
    return read((db) => ({
      codeTaken: !!code && db.schools.some((s) => s.code === code),
      slugTaken: !!slug && db.schools.some((s) => s.slug === slug),
    }));
  },

  async operators(ctx: Ctx) {
    requirePlatform(ctx);
    return read((db) => db.users.filter((u) => u.isPlatformOperator).map((u) => ({ id: u.id, name: u.fullName })));
  },

  /** PL06 — counts by status for the support queue (whole queue, not the current page). */
  async ticketStats(ctx: Ctx) {
    requirePlatform(ctx);
    return read((db) => {
      const by = (s: SupportTicket["status"]) => db.tickets.filter((t) => t.status === s).length;
      return { total: db.tickets.length, open: by("open"), inProgress: by("in_progress"), waitingSchool: by("waiting_school"), resolved: by("resolved"), high: db.tickets.filter((t) => t.priority === "high" && t.status !== "resolved").length };
    });
  },

  /** PL06 — assign a ticket to a platform operator (internal routing only). */
  async assignTicket(ctx: Ctx, ticketId: ID, assigneeUserId: ID) {
    requirePlatform(ctx);
    return write((db) => {
      const t = findOr404(db.tickets.find((x) => x.id === ticketId), "yêu cầu hỗ trợ");
      const op = db.users.find((u) => u.id === assigneeUserId && u.isPlatformOperator);
      if (!op) validation({ assignee: "Chỉ phân công cho nhân sự vận hành nền tảng" });
      const before = { assignee: staffNameById(db, t.assigneeUserId, false) };
      t.assigneeUserId = assigneeUserId;
      if (t.status === "open") t.status = "in_progress";
      audit(db, ctx, { level: "platform", action: "Phân công xử lý yêu cầu hỗ trợ", entityType: "ticket", entityId: t.id, entityLabel: t.title, before, after: { assignee: op!.fullName } });
      return t;
    });
  },

  /**
   * PL08 / O34 — the platform can withdraw its own pending request or end an active
   * grant early (give access back). It can never approve or extend a grant.
   */
  async relinquishGrant(ctx: Ctx, grantId: ID, reason: string) {
    requirePlatform(ctx);
    return write((db) => {
      const g = findOr404(db.supportGrants.find((x) => x.id === grantId), "quyền hỗ trợ");
      const st = effectiveGrantStatus(g, ctx.now);
      if (st !== "requested" && st !== "active") throw new RepoError("VALIDATION", "Chỉ rút được đề nghị đang chờ hoặc kết thúc sớm quyền đang hiệu lực.");
      g.status = "revoked";
      g.revokedAt = ctx.now;
      audit(db, ctx, { level: "platform", action: st === "requested" ? "Rút đề nghị quyền hỗ trợ" : "Kết thúc sớm quyền hỗ trợ", entityType: "supportGrant", entityId: g.id, entityLabel: db.schools.find((s) => s.id === g.schoolId)?.shortName ?? "", before: { status: st }, after: { status: "revoked" }, reason: reason || undefined });
      return g;
    });
  },

  /** O34 — pickers: schools the platform may ask to support (active only) and their open tickets. */
  async supportTargets(ctx: Ctx) {
    requirePlatform(ctx);
    return read((db) => ({
      schools: db.schools.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.shortName })),
      tickets: db.tickets.filter((t) => t.status !== "resolved").map((t) => ({ id: t.id, schoolId: t.schoolId, title: t.title })),
    }));
  },
};

/* ------------------------------ Auth / public helpers (no session needed) ------------------------------ */
export const authDemoRepo = {
  /** AU01 — a few demo emails reviewers can use (the password is never checked). */
  async loginHints() {
    return read((db) => ["u-bao", "u-hanh", "u-lan", "u-nam"].map((id) => db.users.find((u) => u.id === id)).filter(Boolean).map((u) => ({ email: u!.email, name: u!.fullName, platform: !!u!.isPlatformOperator })));
  },

  /** AU02 — always the same generic answer; never reveals whether the account exists. Sends nothing. */
  async requestPasswordReset(email: string) {
    return read(() => {
      const e = email.trim();
      if (!e) validation({ email: "Vui lòng nhập email công việc" });
      if (!/^\S+@\S+\.\S+$/.test(e)) validation({ email: "Email chưa đúng định dạng" });
      return { accepted: true as const, demoToken: "demo-valid" };
    });
  },

  /** AU03 — demo tokens only. */
  async checkResetToken(token: string | null) {
    return read(() => (token === "demo-valid" ? { state: "valid" as const, expiresAt: "2026-10-05T09:00:00+07:00" } : { state: token ? ("expired" as const) : ("missing" as const) }));
  },

  /** AU03 — validates the new password, stores nothing. */
  async completePasswordReset(token: string, password: string, confirm: string) {
    return read(() => {
      if (token !== "demo-valid") throw new RepoError("EXPIRED", "Đường dẫn đặt lại mật khẩu đã hết hạn hoặc không hợp lệ.");
      const errors = passwordErrors(password, confirm);
      if (Object.keys(errors).length) validation(errors);
      return { done: true as const };
    });
  },

  /** SY03/SY04/SY06/PL11 — public contact details of the platform. */
  async publicContact() {
    return read((db) => ({ brandName: db.platformSettings.brandName, supportEmail: db.platformSettings.supportEmail, supportPhone: db.platformSettings.supportPhone, footerNote: db.platformSettings.footerNote }));
  },

  /** SY07 — "try again": reads the local store; there is no remote service to probe. */
  async healthCheck() {
    return read((db) => ({ ok: true as const, revision: db.meta.revision }));
  },

  /** SY06 — public info for a suspended school (no staff/student data). */
  async schoolStatusBySlug(slug: string) {
    return read((db) => {
      const s = db.schools.find((x) => x.slug === slug);
      if (!s) throw new RepoError("NOT_FOUND", "Không tìm thấy trường.");
      return { name: s.name, slug: s.slug, status: s.status, statusReason: s.statusReason, publicEmail: s.publicEmail, publicPhone: s.publicPhone };
    });
  },
};

export const PASSWORD_RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: "len", label: "Tối thiểu 10 ký tự", test: (p) => p.length >= 10 },
  { key: "letter", label: "Có chữ cái", test: (p) => /[A-Za-zÀ-ỹ]/.test(p) },
  { key: "digit", label: "Có chữ số", test: (p) => /\d/.test(p) },
  { key: "space", label: "Không có khoảng trắng ở đầu/cuối", test: (p) => p.length > 0 && p.trim() === p },
];

export function passwordErrors(password: string, confirm: string, current?: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const failed = PASSWORD_RULES.filter((r) => !r.test(password));
  if (!password) errors.password = "Vui lòng nhập mật khẩu mới";
  else if (failed.length) errors.password = `Mật khẩu chưa đạt: ${failed.map((r) => r.label.toLowerCase()).join(", ")}`;
  else if (current !== undefined && current === password) errors.password = "Mật khẩu mới phải khác mật khẩu hiện tại";
  if (!confirm) errors.confirm = "Vui lòng nhập lại mật khẩu mới";
  else if (confirm !== password) errors.confirm = "Mật khẩu nhập lại không khớp";
  return errors;
}
