"use client";
import { useState, type ReactNode } from "react";
import { Plus, Pencil, Archive, Search, Mail, Save, Trash2, X } from "lucide-react";
import { schoolRepo, studentsRepo } from "@/lib/repositories/demo-index";
import { useRepo } from "@/lib/query/demo-hooks";
import { fmtBytes } from "@/lib/formatters";
import { Button, IconButton } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, DateField, ErrorSummary, InlineSelect, MiniCalendar, NumberField, RadioGroup, SelectField, TextArea, TextField, Toggle, ChipToggleGroup } from "@/components/ui/form";
import { Combobox } from "@/components/ui/combobox";
import { FileDropzone } from "@/components/ui/file";
import { FilterBar } from "@/components/data/table";
import { useToast } from "@/components/ui/toast";
import { RichTextEditor, AudienceSelector } from "@/features/announcements/composer";
import { announcementsRepo } from "@/lib/repositories/demo-index";
import type { BodyBlock } from "@/features/announcements/body";
import { NeedPersona, Frame } from "./common";

const A = "demo-school-a";

function ButtonsExample() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" icon={<Plus className="size-4" />}>Chính</Button>
      <Button variant="secondary">Phụ</Button>
      <Button variant="ghost">Nhẹ</Button>
      <Button variant="danger" icon={<Trash2 className="size-4" />}>Huỷ bỏ</Button>
      <Button variant="danger-soft">Nguy hiểm nhẹ</Button>
      <Button variant="primary" loading={busy} onClick={() => { setBusy(true); window.setTimeout(() => setBusy(false), 1200); }}>{busy ? "Đang xử lý…" : "Bấm để xem trạng thái đang xử lý"}</Button>
      <Button disabled>Không khả dụng</Button>
      <IconButton label="Sửa" icon={<Pencil className="size-4" />} variant="secondary" />
      <p className="w-full text-[12.5px] text-muted">Nút đang xử lý tự khóa để chống bấm hai lần; nút chỉ có biểu tượng luôn có nhãn cho trình đọc màn hình.</p>
    </div>
  );
}

function MenuExample() {
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  return (
    <div className="flex items-center gap-3">
      <ActionMenu items={[{ label: "Xem chi tiết", icon: <Search /> }, { label: "Sửa", icon: <Pencil />, hint: "Mở biểu mẫu sửa" }, { label: "Lưu trữ…", icon: <Archive />, danger: true, separatorBefore: true, onSelect: () => setConfirm(true) }, { label: "Không đủ quyền", disabled: true }]} />
      <span className="text-[12.5px] text-muted">Mở menu, dùng mũi tên và Escape. Mục nguy hiểm mở hộp xác nhận.</span>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Lưu trữ mục ví dụ?" object="Mục ví dụ trong thư viện component" consequence="Đây là ví dụ component; xác nhận chỉ đóng hộp thoại, không đổi dữ liệu." confirmLabel="Lưu trữ" variant="danger"
        onConfirm={() => { setConfirm(false); toast.push({ tone: "info", title: "Ví dụ — không có dữ liệu nào thay đổi" }); }} />
    </div>
  );
}

function TextExample() {
  const [email, setEmail] = useState("lan.tran@");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Họ tên" required helper="Nhãn luôn hiển thị, không dùng placeholder thay nhãn" defaultValue="Trần Thị Lan" />
      <TextField label="Email công việc" type="email" icon={<Mail className="size-4" />} value={email} onChange={(e) => setEmail(e.target.value)} error={/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? undefined : "Email chưa đúng định dạng"} />
      <TextField label="Mật khẩu (mô phỏng)" type="password" defaultValue="matkhau-demo" autoComplete="off" />
      <TextField label="Chỉ đọc" readOnly value="demo-school-a" />
    </div>
  );
}

function TextAreaExample() {
  const [v, setV] = useState("Nội dung ghi chú có đếm ký tự.");
  return <TextArea label="Ghi chú" maxChars={160} value={v} onChange={(e) => setV(e.target.value)} rows={3} />;
}

function ComboExample() {
  const classes = useRepo(["class-options", A], (ctx) => schoolRepo.classOptions(ctx, A));
  const [one, setOne] = useState<string>("");
  const [many, setMany] = useState<string[]>([]);
  const options = (classes.data ?? []).map((c) => ({ value: c.id, label: c.name, hint: c.status === "draft" ? "Nháp" : undefined }));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Combobox label="Một lớp (trường A)" options={options} value={one} onChange={(v) => setOne(v as string)} helper={classes.isLoading ? "Đang tải lớp…" : `${options.length} lớp từ repository`} />
      <Combobox label="Nhiều lớp" multiple options={options} value={many} onChange={(v) => setMany(v as string[])} emptyText="Không có lớp phù hợp" />
    </div>
  );
}

function ChoiceExample() {
  const [a, setA] = useState(true);
  const [r, setR] = useState<"week" | "month">("week");
  const [t, setT] = useState(false);
  const [chips, setChips] = useState<("attendance" | "conduct" | "activities")[]>(["attendance"]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Checkbox label="Mặc định" checked={a} onChange={setA} description="Có mô tả phụ" />
        <Checkbox label="Chọn một phần" checked={false} indeterminate onChange={() => undefined} />
        <Checkbox label="Không khả dụng" checked disabled onChange={() => undefined} />
      </div>
      <RadioGroup label="Kỳ báo cáo" value={r} onChange={setR} options={[{ value: "week", label: "Theo tuần" }, { value: "month", label: "Theo tháng" }]} />
      <Toggle checked={t} onChange={setT} label="Hiện trên trang công khai" description="Công tắc chỉ cho cài đặt, không thay hành động cần phê duyệt" />
      <ChipToggleGroup label="Mục phụ huynh được xem" value={chips} onChange={setChips} options={[{ value: "attendance", label: "Chuyên cần" }, { value: "conduct", label: "Thi đua" }, { value: "activities", label: "Hoạt động" }]} />
    </div>
  );
}

function DateExample() {
  const [d, setD] = useState<string | undefined>("2026-10-05");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DateField label="Ngày hiệu lực" value={d} onChange={setD} min="2026-09-01" max="2027-05-31" helper="dd/MM/yyyy, múi giờ Asia/Ho_Chi_Minh; ngoài năm học bị chặn" />
      <MiniCalendar value={d} onSelect={setD} min="2026-09-01" max="2027-05-31" />
    </div>
  );
}

function NumberExample() {
  const [n, setN] = useState<number | undefined>(-5);
  const [m, setM] = useState<number | undefined>(undefined);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <NumberField label="Điểm (âm/dương)" value={n} onChange={setN} min={-50} max={50} helper={`Giá trị hiện tại: ${n === undefined ? "chưa nhập" : n}`} />
      <NumberField label="Sức chứa (không âm)" value={m} onChange={setM} min={1} max={60} allowNegative={false} helper={m === undefined ? "Để trống = chưa có dữ liệu, không phải 0" : `= ${m}`} />
    </div>
  );
}

function FormErrorExample() {
  const [v, setV] = useState({ name: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  const submit = () => {
    const e: Record<string, string> = {};
    if (v.name.trim().length < 3) e.name = "Họ tên tối thiểu 3 ký tự";
    if (!/^[0-9 ]{9,12}$/.test(v.phone.trim())) e.phone = "Số liên hệ 9–12 chữ số";
    setErrors(e);
    setOk(!Object.keys(e).length);
  };
  return (
    <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorSummary errors={errors} labels={{ name: "Họ tên", phone: "Số liên hệ" }} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div data-field="name"><TextField label="Họ tên" required value={v.name} error={errors.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div data-field="phone"><TextField label="Số liên hệ" required value={v.phone} error={errors.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" icon={<Save className="size-4" />}>Kiểm tra</Button>
        {ok && <span className="text-[13px] text-success-text" role="status">Hợp lệ — ví dụ này không lưu dữ liệu.</span>}
      </div>
    </form>
  );
}

function DropzoneExample() {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <div className="space-y-2">
      <FileDropzone accept={[".png", ".jpg", ".pdf", "image/png", "image/jpeg", "application/pdf"]} maxBytes={2 * 1024 * 1024} multiple onFiles={setFiles} hint="PNG, JPG, PDF — tối đa 2 MB." />
      {files.length > 0 && (
        <ul className="space-y-1 text-[13px]">
          {files.map((f) => <li key={f.name} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-1.5"><span className="truncate">{f.name}</span><span className="text-muted">{fmtBytes(f.size)}</span></li>)}
          <li><Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setFiles([])}>Bỏ chọn</Button></li>
        </ul>
      )}
    </div>
  );
}

function RichTextExample() {
  const [v, setV] = useState<BodyBlock[]>([{ type: "p", text: "" }] as BodyBlock[]);
  return <RichTextEditor value={v} onChange={setV} />;
}

function AudienceExample() {
  const opts = useRepo(["ann-compose", A, ""], (c) => announcementsRepo.composeOptions(c, A));
  const [scope, setScope] = useState<Parameters<typeof AudienceSelector>[0]["scope"]>({ type: "school" });
  if (opts.isLoading) return <p className="text-[13px] text-muted">Đang tải đối tượng…</p>;
  if (opts.error || !opts.data) return <p className="text-[13px] text-danger-text">{opts.error?.message ?? "Không tải được"}</p>;
  return <AudienceSelector schoolId={A} origin="school" options={opts.data} scope={scope} onScope={setScope} />;
}

function FilterExample() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const list = useRepo(["preview-c023", q, status], (ctx) => studentsRepo.list(ctx, A, { q, page: 1, pageSize: 5, filters: { status: status || undefined } }));
  return (
    <div className="-mx-4 space-y-1">
      <FilterBar q={q} onQ={setQ} placeholder="Tìm học sinh theo tên, mã…" active={!!q || !!status} onReset={() => { setQ(""); setStatus(""); }}>
        <InlineSelect label="Trạng thái" value={status} onChange={setStatus} allLabel="Mọi trạng thái" options={[{ value: "studying", label: "Đang học" }, { value: "transferred_out", label: "Đã chuyển đi" }, { value: "left", label: "Ngừng theo học" }]} />
      </FilterBar>
      <p className="px-4 text-[12.5px] text-muted" aria-live="polite">{list.data ? `${list.data.total} học sinh khớp (lọc thật trong repository)` : "Đang lọc…"}</p>
    </div>
  );
}

function StickyBarExample() {
  const [dirty, setDirty] = useState(false);
  return (
    <div className="space-y-2">
      <Checkbox label="Giả lập biểu mẫu có thay đổi" checked={dirty} onChange={setDirty} />
      {dirty && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white/95 px-4 py-2.5 shadow-[var(--shadow-pop)] backdrop-blur" role="region" aria-label="Thanh thao tác">
          <span className="text-[13px] font-semibold text-ink">Có thay đổi chưa lưu</span>
          <span className="ml-auto flex gap-2"><Button size="sm" variant="ghost" onClick={() => setDirty(false)}>Hủy</Button><Button size="sm" variant="primary" onClick={() => setDirty(false)}>Lưu</Button></span>
        </div>
      )}
      <p className="text-[12.5px] text-muted">Mẫu bố cục thanh thao tác dính đáy (chưa có component dùng chung riêng — xem ghi chú cuối báo cáo).</p>
    </div>
  );
}

export const INPUT_EXAMPLES: Record<string, () => ReactNode> = {
  C011: () => <ButtonsExample />,
  C012: () => <MenuExample />,
  C013: () => <TextExample />,
  C014: () => <TextAreaExample />,
  C015: () => <NeedPersona need={{ kind: "staff", userId: "u-hanh" }}><ComboExample /></NeedPersona>,
  C016: () => <ChoiceExample />,
  C017: () => <DateExample />,
  C018: () => <NumberExample />,
  C019: () => <FormErrorExample />,
  C020: () => <DropzoneExample />,
  C021: () => <RichTextExample />,
  C022: () => <NeedPersona need={{ kind: "staff", userId: "u-hanh" }} why="Bộ chọn đối tượng đọc khối/lớp và ước tính số người nhận từ repository (Quản trị trường A)."><Frame><AudienceExample /></Frame></NeedPersona>,
  C023: () => <NeedPersona need={{ kind: "staff", userId: "u-hanh" }}><FilterExample /></NeedPersona>,
  C024: () => <StickyBarExample />,
};

export const INPUT_LIVE = Object.keys(INPUT_EXAMPLES).filter((k) => k !== "C024");
