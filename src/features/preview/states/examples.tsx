"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { RefreshCw, UserX, MailX, Archive, Clock3, Trash2, ExternalLink, FileWarning } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { useRepo, useSession } from "@/lib/query/hooks";
import { setScenario } from "@/lib/demo/scenario";
import { attendanceStatus, matches, studentStatus } from "@/lib/formatters";
import { registryById } from "@/lib/routing/registry";
import { Badge, PUBLICATION_STATUS, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { InlineSelect } from "@/components/ui/form";
import { FilePreview } from "@/components/ui/file";
import { DeniedState, EmptyFiltered, EmptyState, ErrorState, LinkUnavailable, PageSkeleton, SuspendedState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PARENT_LINKS, accessHref } from "../open";

const href = (id: string) => registryById(id)?.href ?? "/";

function RouteLink({ id, children }: { id: string; children?: ReactNode }) {
  const e = registryById(id);
  return <Link href={href(id)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary-strong hover:underline">{children ?? `Xem trong ${id} — ${e?.title ?? ""}`}</Link>;
}

function Box({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-xl border border-line bg-white ${className ?? ""}`}>{children}</div>;
}

/* ST01 */
function LoadingExample() {
  const [v, setV] = useState<"table" | "form" | "cards" | "parent" | "detail" | "dashboard">("table");
  return (
    <div className="space-y-2">
      <InlineSelect label="Biến thể skeleton" value={v} onChange={(x) => setV((x || "table") as typeof v)} options={["table", "form", "cards", "parent", "detail", "dashboard"].map((x) => ({ value: x, label: { table: "Bảng", form: "Biểu mẫu", cards: "Thẻ", parent: "Phụ huynh", detail: "Chi tiết", dashboard: "Tổng quan" }[x]! }))} />
      <Box className="max-h-64 overflow-y-auto"><PageSkeleton variant={v} /></Box>
    </div>
  );
}

/* ST03 — real client-side filter over repository rows */
function FilteredExample() {
  const links = useRepo(["demo-links"], () => parentRepo.demoLinks());
  const [q, setQ] = useState("không-khớp-gì");
  const rows = (links.data ?? []).filter((l) => matches(q, l.studentName, l.relation, l.schoolName));
  return (
    <div className="space-y-2">
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm link demo" />
      <Box>
        {links.isLoading ? <div className="p-3"><Skeleton className="h-10" /></div> : rows.length ? (
          <ul className="divide-y divide-line text-[13px]">{rows.slice(0, 4).map((l) => <li key={l.id} className="px-3 py-2">{l.studentName} — {l.relation}</li>)}</ul>
        ) : <EmptyFiltered onReset={() => setQ("")} what="link" />}
      </Box>
    </div>
  );
}

/* ST04 — real read through the repository with a one-shot read failure */
function ReadErrorExample() {
  const links = useRepo(["preview-st04"], () => parentRepo.demoLinks());
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => { setScenario({ read: "error-next" }); void links.refetch(); }}>Tải lại với lỗi đọc</Button>
        <Button size="sm" variant="ghost" onClick={() => void links.refetch()}>Tải lại bình thường</Button>
      </div>
      <Box>
        {links.isFetching ? <div className="p-3"><Skeleton className="h-16" /></div> : links.error ? <ErrorState compact error={links.error} onRetry={() => void links.refetch()} /> : (
          <p className="p-3 text-[13px] text-body">Đã tải {links.data?.length ?? 0} link demo từ repository.</p>
        )}
      </Box>
    </div>
  );
}

/* ST11 — expire the real demo session, then restore it */
function SessionExample() {
  const { session, expire, signIn } = useSession();
  const [saved, setSaved] = useState<typeof session>(null);
  if (!session || session.actor.kind === "anonymous") return <p className="text-[13px] text-muted">Chọn vai trò nhân sự ở thanh trên để thử.</p>;
  const expired = !!session.expiresAt;
  return (
    <div className="space-y-2 text-[13px]">
      <p>Phiên hiện tại: <b>{session.actor.userId}</b> — {expired ? <Badge tone="danger">Đã hết hạn</Badge> : <Badge tone="success">Còn hiệu lực</Badge>}</p>
      <div className="flex flex-wrap gap-2">
        {!expired ? <Button size="sm" variant="secondary" icon={<Clock3 className="size-4" />} onClick={() => { setSaved(session); expire(); }}>Mô phỏng hết phiên</Button>
          : <Button size="sm" variant="primary" onClick={() => { const a = (saved ?? session).actor; if (a.kind !== "anonymous") signIn(a, "demo"); }}>Khôi phục phiên</Button>}
        {expired && <RouteLink id="AU06">Mở hồ sơ cá nhân để thấy màn hình hết phiên</RouteLink>}
      </div>
    </div>
  );
}

/* ST27 */
function ConfirmExample() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button size="sm" variant="danger-soft" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>Lưu trữ lớp nháp…</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Lưu trữ lớp nháp?" object="Lớp 10A3 (nháp) — năm 2026–2027" variant="danger" reasonRequired reasonLabel="Lý do"
        consequence="Ví dụ hộp xác nhận: nêu đúng đối tượng và hậu quả. Bấm Hủy không đổi dữ liệu. Ở đây nút xác nhận chỉ đóng hộp thoại — thao tác thật nằm ở Danh sách lớp."
        confirmLabel="Xác nhận" onConfirm={() => { setOpen(false); toast.push({ tone: "info", title: "Không có dữ liệu nào bị thay đổi", detail: "Đây là hộp xác nhận mẫu của trang nội bộ." }); }} />
    </>
  );
}

const pub = (k: string) => <StatusBadge status={k} map={PUBLICATION_STATUS} />;

/** Live examples per state id. */
export const STATE_EXAMPLES: Record<string, () => ReactNode> = {
  ST01: () => <LoadingExample />,
  ST02: () => <Box><EmptyState compact title="Chưa có hoạt động nào" description="Lớp chưa có hoạt động. Giáo viên có quyền có thể tạo hoạt động đầu tiên; phụ huynh không có nút tạo." action={<ButtonLink href={href("CL18")} size="sm" variant="primary">Tạo hoạt động</ButtonLink>} /></Box>,
  ST03: () => <FilteredExample />,
  ST04: () => <ReadErrorExample />,
  ST05: () => <p className="text-[13px] text-body">Chọn “Lần lưu kế tiếp lỗi mạng” rồi bấm Lưu ở <a href="#live" className="font-semibold text-primary-strong underline">biểu mẫu thử lưu</a>: toast lỗi, nội dung giữ nguyên, không báo thành công.</p>,
  ST06: () => <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="primary" loading>Đang lưu…</Button><span className="text-[12.5px] text-muted">Nút bị khóa khi đang lưu; điều hướng khác vẫn dùng được. Xem trực tiếp ở <a href="#live" className="font-semibold text-primary-strong underline">biểu mẫu thử lưu</a>.</span></div>,
  ST07: () => <div className="space-y-1.5 text-[13px]"><Badge tone="success">Đã lưu cục bộ (mô phỏng)</Badge><p className="text-body">Sau khi lưu thành công, toast ghi “Đã lưu vào dữ liệu demo trên trình duyệt này” — không khẳng định đã gửi lên máy chủ.</p></div>,
  ST08: () => <p className="text-[13px] text-body">Nhập họ tên dưới 3 ký tự ở <a href="#live" className="font-semibold text-primary-strong underline">biểu mẫu thử lưu</a>: lỗi hiện đúng ô, bảng tóm tắt lỗi nhận focus.</p>,
  ST09: () => <Box><DeniedState compact /></Box>,
  ST10: () => <Box><EmptyState compact icon={<UserX className="size-6" />} title="Bạn chưa được phân công lớp nào" description="Hãy liên hệ quản trị trường để được phân công. Không có dữ liệu mẫu lấp khoảng trống." action={<RouteLink id="AU08">Mở màn hình AU08</RouteLink>} /></Box>,
  ST11: () => <SessionExample />,
  ST12: () => <Box><EmptyState compact icon={<MailX className="size-6" />} title="Lời mời đã hết hạn hoặc bị thu hồi" description="Không thể chấp nhận lời mời này. Hãy liên hệ người đã mời bạn để được gửi lời mời mới." action={<RouteLink id="AU04">Mở màn hình nhận lời mời</RouteLink>} /></Box>,
  ST13: () => <div className="space-y-2"><Box><SuspendedState compact /></Box><a href={accessHref(PARENT_LINKS.suspended.slug, PARENT_LINKS.suspended.token)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary-strong hover:underline"><ExternalLink className="size-3.5" aria-hidden />Mở link phụ huynh của trường tạm dừng</a></div>,
  ST14: () => <div className="flex flex-wrap gap-2">{(["unmarked", "present", "late", "excused", "unexcused"] as const).map((k) => <Badge key={k} tone={attendanceStatus[k].tone}>{attendanceStatus[k].label}</Badge>)}<p className="w-full text-[12.5px] text-muted">“Chưa điểm danh” là trạng thái riêng, không cộng vào có mặt.</p></div>,
  ST15: () => <div className="space-y-1.5 text-[13px]">{pub("open")}<p className="text-body">Phía phụ huynh: “Nhà trường chưa công bố kết quả tuần này” — không hiện 0 điểm hay “Không vi phạm”.</p></div>,
  ST16: () => <div className="space-y-1.5 text-[13px]">{pub("locked")}<p className="text-body">Nhân sự đủ quyền xem bản đã chốt; phụ huynh vẫn chưa thấy.</p></div>,
  ST17: () => <div className="space-y-1.5 text-[13px]">{pub("published")}<p className="text-body">Hiển thị phiên bản và thời điểm công bố, đúng đối tượng. <RouteLink id="CL10">Xem bản công bố tuần 4</RouteLink></p></div>,
  ST18: () => <div className="space-y-1.5 text-[13px]"><div className="flex flex-wrap gap-2">{pub("pending")}{pub("superseded")}</div><p className="text-body">Trong khi điều chỉnh chờ duyệt, phụ huynh vẫn thấy bản công bố trước. <RouteLink id="CL11">Xem điều chỉnh adj-1</RouteLink></p></div>,
  ST19: () => <div className="space-y-1.5 text-[13px]">{pub("withdrawn")}<p className="text-body">Lần tải mới dừng hiển thị nội dung đã thu hồi, không giữ cache cũ.</p></div>,
  ST20: () => <p className="text-[13px] text-body">Chọn “Lần lưu kế tiếp xung đột phiên bản” rồi lưu ở <a href="#live" className="font-semibold text-primary-strong underline">biểu mẫu thử lưu</a>: hộp thoại Dữ liệu đã thay đổi hiện bản của bạn và lựa chọn an toàn.</p>,
  ST21: () => <p className="text-[13px] text-body">Mở overlay <a href="#O18" className="font-semibold text-primary-strong underline">O18</a> bên dưới, hoặc thử luồng thật: <RouteLink id="CL06">Ghi nhận thi đua 10A1</RouteLink></p>,
  ST22: () => (
    <div className="space-y-2">
      <Box><LinkUnavailable reason="Link đã hết hạn, bị thu hồi hoặc không hợp lệ. Trang này không hiển thị thông tin học sinh." /></Box>
      <div className="flex flex-wrap gap-3">{(["expired", "revoked"] as const).map((k) => <a key={k} href={accessHref(PARENT_LINKS[k].slug, PARENT_LINKS[k].token)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary-strong hover:underline"><ExternalLink className="size-3.5" aria-hidden />{PARENT_LINKS[k].label}</a>)}
        <a href={accessHref("binh-minh", "khong-hop-le")} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary-strong hover:underline"><ExternalLink className="size-3.5" aria-hidden />Link không hợp lệ</a></div>
    </div>
  ),
  ST23: () => <div className="space-y-2"><FilePreview file={null} revoked className="max-h-48" /><p className="flex items-center gap-1.5 text-[12.5px] text-muted"><FileWarning className="size-3.5" aria-hidden />Tệp bị thu hồi: có lý do, không hiện nội dung cũ.</p></div>,
  ST24: () => <Callout tone="neutral" icon={<Archive />} title="Năm học 2025–2026 đã lưu trữ">Chỉ xem, trừ quy trình được cấp riêng. <RouteLink id="SC03">Danh sách năm học</RouteLink></Callout>,
  ST25: () => <div className="space-y-1.5"><div className="flex flex-wrap gap-2">{(["studying", "transferred_out", "left"] as const).map((k) => <Badge key={k} tone={studentStatus[k].tone}>{studentStatus[k].label}</Badge>)}</div><p className="text-[12.5px] text-muted">Báo cáo cũ vẫn giữ lớp cũ theo đúng thời gian. <RouteLink id="SC20">Chuyển lớp</RouteLink></p></div>,
  ST26: () => <Box><DeniedState compact revoked message="Phân công của bạn tại lớp này vừa bị thu hồi." /></Box>,
  ST27: () => <ConfirmExample />,
  ST28: () => <div className="flex flex-wrap gap-2"><ButtonLink href="/khong-ton-tai-demo" size="sm" variant="secondary">Mở một route không tồn tại (404)</ButtonLink></div>,
};
