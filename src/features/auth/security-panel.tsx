"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, MonitorSmartphone, LogOut, Clock3, ShieldAlert, FlaskConical } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import { passwordErrors } from "@/lib/repositories/platform-extra";
import { useRepo, useSession } from "@/lib/query/hooks";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DemoTag, Badge } from "@/components/ui/badge";
import { useUnsavedChanges } from "@/components/ui/guards";
import { PasswordField, PasswordRules } from "./password-field";

const VIA: Record<string, string> = { demo: "Chọn vai trò trong trang demo", login: "Màn hình đăng nhập (mô phỏng)", invitation: "Chấp nhận lời mời (mô phỏng)" };

/** AU07 — simulated password change + demo session info + end session (shows ST11). */
export function SecurityPage() {
  const { session, expire, signOut } = useSession();
  const router = useRouter();
  const me = useRepo(["me"], (ctx) => sessionRepo.me(ctx));
  const [endOpen, setEndOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  return (
    <div className="page">
      <PageHeader title="Bảo mật và phiên demo" subtitle="Mẫu thao tác bảo mật cho nhân sự. Bản demo không có xác thực backend." breadcrumbs={[{ label: "Tài khoản", href: "/account/profile" }, { label: "Bảo mật và phiên" }]} badge={<DemoTag />} />
      <Callout tone="warning" icon={<FlaskConical />} title="Mô phỏng — không khẳng định có xác thực thật">
        Mọi thao tác trên trang này chỉ minh họa trải nghiệm. Không có mật khẩu nào được lưu, không có phiên máy chủ nào được tạo hoặc hủy.
      </Callout>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChangePassword email={me.data?.user.email} />
        <Card>
          <CardHeader title="Phiên demo hiện tại" icon={<MonitorSmartphone className="size-5" />} action={<Badge tone="success">Đang dùng</Badge>} />
          <dl className="divide-y divide-line px-5">
            <InfoRow label="Người dùng">{me.data ? `${me.data.user.fullName} (${me.data.user.email})` : "…"}</InfoRow>
            <InfoRow label="Loại phiên">{session?.actor.kind === "platform" ? "Vận hành nền tảng" : "Nhân sự nhà trường"}</InfoRow>
            <InfoRow label="Bắt đầu lúc">{session ? fmtDateTime(session.startedAt) : "—"}</InfoRow>
            <InfoRow label="Cách vào">{session ? VIA[session.via] ?? session.via : "—"}</InfoRow>
            <InfoRow label="Lưu ở đâu">Bộ nhớ của tab trình duyệt này (sessionStorage). Không phải cookie/phiên máy chủ.</InfoRow>
          </dl>
          <div className="space-y-3 p-5">
            <p className="text-[13px] text-muted">“Kết thúc phiên demo” mô phỏng việc phiên hết hạn: trang sẽ yêu cầu đăng nhập lại (trạng thái hết phiên). “Thoát phiên” xóa vai trò demo khỏi trình duyệt.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger-soft" icon={<Clock3 className="size-4" />} onClick={() => setEndOpen(true)}>Kết thúc phiên demo</Button>
              <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => setOutOpen(true)}>Thoát phiên</Button>
            </div>
          </div>
        </Card>
      </div>
      <ConfirmDialog open={endOpen} onOpenChange={setEndOpen} title="Kết thúc phiên demo" object={me.data?.user.fullName}
        consequence="Phiên hiện tại sẽ được đánh dấu hết hạn trên trình duyệt này. Bạn sẽ thấy màn hình “Phiên demo đã hết” và cần đăng nhập lại (mô phỏng). Dữ liệu demo đã lưu không bị ảnh hưởng."
        confirmLabel="Kết thúc phiên" variant="danger" onConfirm={() => { setEndOpen(false); expire(); }} />
      <ConfirmDialog open={outOpen} onOpenChange={setOutOpen} title="Thoát phiên demo" object={me.data?.user.fullName}
        consequence="Vai trò demo sẽ bị xóa khỏi trình duyệt này. Bạn quay về màn hình đăng nhập."
        confirmLabel="Thoát phiên" onConfirm={() => { setOutOpen(false); signOut(); router.push("/login"); }} />
    </div>
  );
}

function ChangePassword({ email }: { email?: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = !!(current || next || confirm);
  useUnsavedChanges(dirty);
  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); setErrors({}); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = { ...(current ? {} : { current: "Vui lòng nhập mật khẩu hiện tại" }), ...passwordErrors(next, confirm, current) };
    if (email && next && next.toLowerCase().includes(email.split("@")[0].toLowerCase())) errs.password = "Mật khẩu không nên chứa phần tên trong email";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 400));
    setBusy(false);
    reset();
    toast.push({ tone: "info", title: "Đã kiểm tra biểu mẫu (mô phỏng)", detail: "Mật khẩu hợp lệ theo quy tắc, nhưng bản demo không lưu và không đổi mật khẩu nào." });
  };
  return (
    <Card>
      <CardHeader title="Đổi mật khẩu" icon={<KeyRound className="size-5" />} action={<DemoTag />} />
      <form className="space-y-4 px-5 pb-5" onSubmit={submit} noValidate>
        <ErrorSummary errors={errors} labels={{ current: "Mật khẩu hiện tại", password: "Mật khẩu mới", confirm: "Nhập lại" }} />
        <div data-field="current"><PasswordField id="sec-current" label="Mật khẩu hiện tại" required value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} /></div>
        <div data-field="password"><PasswordField id="sec-new" label="Mật khẩu mới" required value={next} onChange={(e) => setNext(e.target.value)} error={errors.password} /></div>
        <PasswordRules value={next} />
        <div data-field="confirm"><PasswordField id="sec-confirm" label="Nhập lại mật khẩu mới" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} /></div>
        <p className="flex items-start gap-2 text-[12.5px] text-muted"><ShieldAlert className="mt-0.5 size-3.5 flex-none" aria-hidden />Khi có backend thật, đổi mật khẩu sẽ kết thúc các phiên khác. Bản demo chỉ kiểm tra quy tắc.</p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={reset} disabled={!dirty || busy}>Hủy</Button>
          <Button type="submit" variant="primary" loading={busy}>Đổi mật khẩu (mô phỏng)</Button>
        </div>
      </form>
    </Card>
  );
}
