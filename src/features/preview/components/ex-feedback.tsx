"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal, Drawer, BottomSheet, ConfirmDialog } from "@/components/ui/dialog";
import { TextField, RadioGroup } from "@/components/ui/form";
import { DemoScenarioBanner } from "@/components/ui/guards";
import { DeniedState, EmptyState, ErrorState, PageSkeleton, SuspendedState } from "@/components/ui/states";
import { attendanceStatus } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { RepoError } from "@/lib/repositories/demo-index";
import { UnsavedGuardDemo, REAL_OVERLAYS } from "../states/real-overlays";
import { NeedPersona, Frame } from "./common";

function ModalExample() {
  const [size, setSize] = useState<"sm" | "md" | "lg" | "xl" | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {(["sm", "md", "lg", "xl"] as const).map((s) => <Button key={s} size="sm" variant="secondary" onClick={() => setSize(s)}>Hộp thoại {s}</Button>)}
      <Modal open={!!size} onOpenChange={(o) => !o && setSize(null)} size={size ?? "md"} title={`Hộp thoại cỡ ${size}`} description="Focus bị giữ trong hộp thoại; Escape đóng; focus trả về nút mở."
        footer={<><Button variant="ghost" onClick={() => setSize(null)}>Đóng</Button><Button variant="primary" onClick={() => setSize(null)}>Đồng ý</Button></>}>
        <TextField label="Trường nhập để thử focus" />
      </Modal>
    </div>
  );
}

function DrawerExample() {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState("");
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Mở drawer chi tiết</Button>
      <Drawer open={open} onOpenChange={setOpen} title="Drawer chi tiết" description="Trên điện thoại chiếm toàn màn hình."
        footer={<><Button variant="ghost" onClick={() => { setDirty(""); setOpen(false); }}>Hủy</Button><Button variant="primary" onClick={() => { setDirty(""); setOpen(false); }}>Xong</Button></>}>
        <div className="space-y-3"><TextField label="Ghi chú" value={dirty} onChange={(e) => setDirty(e.target.value)} /><p className="text-[12.5px] text-muted">Nút Hủy không thay đổi dữ liệu.</p></div>
      </Drawer>
    </>
  );
}

function SheetExample() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<"present" | "late" | "excused" | "unexcused">("present");
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Mở bottom sheet chọn trạng thái</Button>
      <BottomSheet open={open} onOpenChange={setOpen} title="Chọn trạng thái" footer={<Button variant="primary" block onClick={() => setOpen(false)}>Chọn</Button>}>
        <RadioGroup label="Trạng thái điểm danh" value={v} onChange={setV} options={(["present", "late", "excused", "unexcused"] as const).map((k) => ({ value: k, label: attendanceStatus[k].label }))} />
      </BottomSheet>
    </>
  );
}

function ConfirmExample() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button size="sm" variant="danger-soft" onClick={() => setOpen(true)}>Thu hồi…</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Thu hồi mục ví dụ?" object="Mục ví dụ — không phải dữ liệu thật" consequence="Nêu hậu quả cụ thể; lý do bắt buộc. Hủy không đổi dữ liệu." confirmLabel="Thu hồi" variant="danger" reasonRequired reasonLabel="Lý do"
        onConfirm={() => { setOpen(false); toast.push({ tone: "info", title: "Ví dụ — không có dữ liệu nào thay đổi" }); }} />
    </>
  );
}

function ToastExample() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => toast.push({ tone: "success", title: "Ví dụ toast thành công", detail: "Trong màn hình thật chỉ xuất hiện sau khi lệnh lưu hoàn tất." })}>Thành công</Button>
      <Button size="sm" variant="secondary" onClick={() => toast.push({ tone: "error", title: "Ví dụ: Chưa lưu được", detail: "Mất kết nối (mô phỏng). Nội dung vẫn còn." })}>Lỗi</Button>
      <Button size="sm" variant="secondary" onClick={() => toast.push({ tone: "warning", title: "Ví dụ cảnh báo" })}>Cảnh báo</Button>
      <Button size="sm" variant="secondary" onClick={() => toast.push({ tone: "info", title: "Ví dụ thông tin", action: { label: "Hoàn tác", onClick: () => undefined } })}>Có hành động</Button>
    </div>
  );
}

function SkeletonExample() {
  const [v, setV] = useState<"table" | "form" | "cards" | "parent">("cards");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">{(["table", "form", "cards", "parent"] as const).map((x) => <Button key={x} size="sm" variant={v === x ? "primary" : "secondary"} onClick={() => setV(x)}>{{ table: "Bảng", form: "Form", cards: "Thẻ", parent: "Phụ huynh" }[x]}</Button>)}</div>
      <Frame className="max-h-56 overflow-hidden !p-0"><PageSkeleton variant={v} /></Frame>
    </div>
  );
}

function ErrorsExample() {
  const [k, setK] = useState<"NETWORK" | "FORBIDDEN" | "REVOKED" | "NOT_FOUND" | "SUSPENDED">("NETWORK");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">{(["NETWORK", "FORBIDDEN", "REVOKED", "NOT_FOUND", "SUSPENDED"] as const).map((x) => <Button key={x} size="sm" variant={k === x ? "primary" : "secondary"} onClick={() => setK(x)}>{{ NETWORK: "Lỗi mạng", FORBIDDEN: "Không có quyền", REVOKED: "Bị thu hồi", NOT_FOUND: "Không tìm thấy", SUSPENDED: "Trường tạm dừng" }[x]}</Button>)}</div>
      <Frame>{k === "SUSPENDED" ? <SuspendedState compact /> : k === "FORBIDDEN" ? <DeniedState compact /> : <ErrorState compact error={new RepoError(k)} onRetry={() => undefined} />}</Frame>
    </div>
  );
}

export const FEEDBACK_EXAMPLES: Record<string, () => ReactNode> = {
  C037: () => <ModalExample />,
  C038: () => <DrawerExample />,
  C039: () => <SheetExample />,
  C040: () => <ConfirmExample />,
  C041: () => <ToastExample />,
  C042: () => <SkeletonExample />,
  C043: () => <Frame><EmptyState compact title="Chưa được phân công lớp" description="Liên hệ quản trị trường. Phụ huynh không thấy nút nhập dữ liệu." /></Frame>,
  C044: () => <ErrorsExample />,
  C045: () => <UnsavedGuardDemo />,
  C046: () => <C046 />,
  C047: () => <div className="space-y-2 overflow-hidden rounded-xl border border-line"><DemoScenarioBanner /><DemoScenarioBanner compact /></div>,
};

function C046() {
  const [open, setOpen] = useState(false);
  const o = REAL_OVERLAYS.O33;
  return (
    <NeedPersona need={o.need}>
      <div className="space-y-2"><Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Tạo xung đột phiên bản thật</Button><p className="text-[12.5px] text-muted">{o.hint}</p>{o.render(open, () => setOpen(false))}</div>
    </NeedPersona>
  );
}

export const FEEDBACK_LIVE = Object.keys(FEEDBACK_EXAMPLES);
