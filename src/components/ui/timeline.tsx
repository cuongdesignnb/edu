import { clsx } from "clsx";
import type { ReactNode } from "react";
import { fmtDateTime } from "@/lib/formatters";

export interface TimelineItem { id: string; at: string; title: ReactNode; detail?: ReactNode; actor?: string; tone?: "blue" | "green" | "amber" | "red" | "purple" | "neutral"; icon?: ReactNode }

const DOT: Record<string, string> = { blue: "bg-primary", green: "bg-success", amber: "bg-warning", red: "bg-danger", purple: "bg-purple", neutral: "bg-faint" };

/** C032 — business timeline (read-only; history is never edited from the UI). */
export function Timeline({ items, empty = "Chưa có lịch sử.", className }: { items: TimelineItem[]; empty?: string; className?: string }) {
  if (!items.length) return <p className="px-1 py-4 text-sm text-muted">{empty}</p>;
  return (
    <ol className={clsx("relative space-y-4 border-l border-line pl-5", className)}>
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span className={clsx("absolute -left-[26.5px] top-1.5 size-3 rounded-full ring-4 ring-white", DOT[it.tone ?? "blue"])} aria-hidden />
          <p className="text-sm font-semibold text-ink">{it.title}</p>
          {it.detail && <div className="mt-0.5 text-[13px] text-body">{it.detail}</div>}
          <p className="mt-0.5 text-[12px] text-muted">{fmtDateTime(it.at)}{it.actor ? ` · ${it.actor}` : ""}</p>
        </li>
      ))}
    </ol>
  );
}

/** Human labels for audit fields/values; unknown keys fall back to the raw key. */
const FIELD_LABEL: Record<string, string> = {
  accentColor: "Màu nhận diện", added: "Thêm", address: "Địa chỉ", afterTotal: "Tổng sau", assignee: "Người phụ trách", beforeTotal: "Tổng trước",
  brandName: "Tên hiển thị", changed: "Thay đổi", dob: "Ngày sinh", effectiveDate: "Ngày áp dụng", effectiveFrom: "Hiệu lực từ", endDate: "Ngày kết thúc",
  enrolled: "Ghi danh", from: "Từ", fromYearId: "Từ năm học", fullName: "Họ và tên", gender: "Giới tính", homeroom: "Giáo viên chủ nhiệm", left: "Rời lớp",
  linkedCreated: "Link tạo mới", linkedVoided: "Link vô hiệu", motto: "Khẩu hiệu", name: "Tên", province: "Tỉnh/thành", removed: "Gỡ bỏ", roles: "Vai trò",
  share: "Chia sẻ", shortName: "Tên ngắn", status: "Trạng thái", st: "Trạng thái", startDate: "Ngày bắt đầu", supportEmail: "Email hỗ trợ", supportPhone: "Điện thoại hỗ trợ",
  total: "Tổng", validFrom: "Hiệu lực từ", validTo: "Hiệu lực đến",
};
const VALUE_LABEL: Record<string, string> = {
  active: "Đang hoạt động", suspended: "Tạm dừng", archived: "Lưu trữ", draft: "Nháp", pending: "Chờ xử lý", approved: "Đã duyệt", rejected: "Từ chối",
  revoked: "Đã thu hồi", expired: "Hết hạn", published: "Đã công bố", locked: "Đã chốt", open: "Đang mở", superseded: "Đã thay thế", ended: "Đã kết thúc",
  present: "Có mặt", late: "Đi muộn", excused: "Nghỉ có phép", unexcused: "Nghỉ không phép", male: "Nam", female: "Nữ", true: "Có", false: "Không",
};
function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => show(x)).join(", ") : "—";
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${FIELD_LABEL[k] ?? k}: ${show(x)}`).join("; ");
  const s = String(v);
  return VALUE_LABEL[s] ?? s;
}

/** Before → after table for audit details. */
export function AuditDiff({ before, after }: { before?: Record<string, unknown>; after?: Record<string, unknown> }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (!keys.length) return <p className="text-sm text-muted">Không có thay đổi giá trị được ghi.</p>;
  return (
    <div className="table-wrap rounded-xl border border-line">
      <table className="table">
        <thead><tr><th>Trường</th><th>Trước</th><th>Sau</th></tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}><td className="font-medium text-ink">{FIELD_LABEL[k] ?? k}</td><td className="text-danger-text">{show(before?.[k])}</td><td className="text-success-text">{show(after?.[k])}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
