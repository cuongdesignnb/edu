"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Copy, Check, Link2 } from "lucide-react";
import type { GuardianRelationship, ParentAccessLog, ParentModule } from "@/lib/model/types";
import type { RepoError } from "@/lib/repositories";
import { parentModuleLabel, fmtDateTime, type StatusLabel } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { IconButton } from "@/components/ui/button";

export const RELATIONS: GuardianRelationship["relation"][] = ["Mẹ", "Bố", "Ông", "Bà", "Người giám hộ khác"];
export const ALL_MODULES = Object.keys(parentModuleLabel) as ParentModule[];

export const ACCESS_STATUS: Record<"active" | "expired" | "revoked", StatusLabel> = {
  active: { label: "Đang hoạt động", tone: "success" },
  expired: { label: "Hết hạn", tone: "neutral" },
  revoked: { label: "Đã thu hồi", tone: "danger" },
};

export const TRANSFER_STATUS: Record<"pending" | "approved" | "rejected", StatusLabel> = {
  pending: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" },
};

export const IMPORT_RESULT: Record<"new" | "update" | "skip" | "warning" | "error", StatusLabel> = {
  new: { label: "Thêm mới", tone: "success" },
  update: { label: "Cập nhật", tone: "info" },
  skip: { label: "Bỏ qua (đã có)", tone: "neutral" },
  warning: { label: "Cảnh báo trùng tên", tone: "warning" },
  error: { label: "Lỗi", tone: "danger" },
};

export const MODULE_HINT: Record<ParentModule, string> = {
  attendance: "Đi học, nghỉ học, đi muộn đã công bố",
  conduct: "Kết quả thi đua tuần đã công bố",
  timetable: "Thời khóa biểu của lớp",
  duties: "Lịch trực nhật của con",
  activities: "Hoạt động, sự kiện được giao cho con",
  announcements: "Thông báo của trường và lớp",
  teachers: "Giáo viên phụ trách và kênh liên hệ công khai",
  documents: "Tài liệu nhà trường chia sẻ cho phụ huynh",
};

export const EVENT_VERB: Record<ParentAccessLog["event"], string> = {
  issued: "được cấp",
  reissued: "được cấp lại",
  opened: "được mở",
  viewed: "được mở",
  blocked: "bị chặn khi mở (link không còn hiệu lực)",
  revoked: "bị thu hồi",
};

/** Log label that never asserts who actually held the link. */
export function logLabel(relation: string, guardianName: string, event: ParentAccessLog["event"]) {
  return `Link cấp cho ${relation.toLowerCase()} (${guardianName}) ${EVENT_VERB[event]}`;
}
export function moduleOfLog(m?: ParentAccessLog["module"]) {
  if (!m) return "—";
  return m === "overview" ? "Trang tổng quan" : parentModuleLabel[m];
}

export function accessUrl(slug: string, token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/p/${slug}/access?t=${token}`;
}

/** Real QR image encoding the demo link (never a decorative fake). */
export function QrImage({ url, size = 148, className }: { url: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }).then((d) => { if (alive) setSrc(d); }).catch(() => setSrc(undefined));
    return () => { alive = false; };
  }, [url, size]);
  return src
    ? <img src={src} width={size} height={size} alt={`Mã QR của đường dẫn tra cứu ${url}`} className={className} />
    : <span className={`inline-block animate-pulse rounded-lg bg-neutral-bg ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden />;
}

export function useCopy() {
  const toast = useToast();
  return async (text: string, what = "đường dẫn") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.push({ tone: "success", title: "Đã sao chép", detail: `Đã sao chép ${what} vào bộ nhớ tạm.` });
    } catch {
      toast.push({ tone: "warning", title: "Chưa sao chép được", detail: "Trình duyệt chặn bộ nhớ tạm. Hãy chọn và sao chép thủ công." });
    }
  };
}

export function CopyButton({ text, what, label = "Sao chép" }: { text: string; what?: string; label?: string }) {
  const copy = useCopy();
  const [done, setDone] = useState(false);
  return <IconButton label={label} size="sm" icon={done ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={async () => { await copy(text, what); setDone(true); setTimeout(() => setDone(false), 1500); }} />;
}

export function LinkBox({ url }: { url: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5">
      <Link2 className="size-4 flex-none text-muted" aria-hidden />
      <input readOnly value={url} aria-label="Đường dẫn tra cứu demo" className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-ink outline-none" onFocus={(e) => e.currentTarget.select()} />
      <CopyButton text={url} label="Sao chép đường dẫn" />
    </div>
  );
}

/**
 * Printable QR card (O13). While printing, only this card is shown (everything else hidden via
 * a scoped print rule). Shows student + guardian relation only — no other personal data.
 */
export function usePrintQr() {
  const [card, setCard] = useState<ReactNode>(null);
  useEffect(() => {
    if (!card) return;
    document.documentElement.classList.add("print-qr");
    const done = () => { document.documentElement.classList.remove("print-qr"); setCard(null); };
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 350);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.documentElement.classList.remove("print-qr"); };
  }, [card]);
  const node = card && typeof document !== "undefined" ? createPortal(
    <div className="qr-print-root">
      <style>{`.qr-print-root{position:fixed;left:-10000px;top:0}@media print{html.print-qr body>*:not(.qr-print-root){display:none!important}html.print-qr .qr-print-root{position:static;display:block!important}}`}</style>
      {card}
    </div>, document.body) : null;
  return { print: (c: ReactNode) => setCard(c), node };
}

export function QrPrintCard({ url, studentName, className, relation, schoolName, expiresAt }: { url: string; studentName: string; className: string; relation: string; schoolName: string; expiresAt: string }) {
  return (
    <div style={{ width: "120mm", margin: "0 auto", border: "1px solid #cfdcec", borderRadius: 16, padding: "10mm", fontFamily: "inherit", color: "#0b1b3a", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "#5b6b85" }}>{schoolName}</p>
      <p style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>Đường dẫn tra cứu riêng</p>
      <p style={{ fontSize: 14, marginTop: 6 }}>Học sinh: <b>{studentName}</b> — Lớp {className}</p>
      <p style={{ fontSize: 14 }}>Cấp cho: <b>{relation}</b> của học sinh</p>
      <div style={{ display: "flex", justifyContent: "center", margin: "6mm 0" }}><QrImage url={url} size={180} /></div>
      <p style={{ fontSize: 11, wordBreak: "break-all" }}>{url}</p>
      <p style={{ fontSize: 12, marginTop: 4 }}>Hiệu lực đến {fmtDateTime(expiresAt).slice(0, 10)}</p>
      <p style={{ fontSize: 11.5, marginTop: 6, color: "#8a4b00" }}>Chỉ trao tận tay người được cấp. Không đăng vào nhóm chung. Bản demo — link giả định.</p>
    </div>
  );
}

/** Field errors from a VALIDATION RepoError. */
export function fieldErrorsOf(e: RepoError | null | undefined): Record<string, string> {
  return e?.code === "VALIDATION" ? e.fieldErrors ?? {} : {};
}

export const ENROLLMENT_STATUS = {
  "in-effect": {label:"Theo học tại mốc",tone:"success" as const},
  planned: {label:"Chưa bắt đầu",tone:"info" as const},
  ended: {label:"Đã kết thúc",tone:"neutral" as const},
  cancelled: {label:"Đã hủy",tone:"danger" as const},
};
