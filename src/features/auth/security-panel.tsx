"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, MonitorSmartphone, LogOut, Clock3, ShieldAlert, FlaskConical } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import { passwordErrors } from "@/lib/repositories";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import {changeStaffPassword} from "@/lib/api/session";
import {formResult} from "@/lib/repositories/connected/common";
import { fmtDateTime } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DemoTag, Badge } from "@/components/ui/badge";
import { useUnsavedChanges } from "@/components/ui/guards";
import { PasswordField, PasswordRules } from "./password-field";

const VIA: Record<string,string>={login:"Màn hình đăng nhập",invitation:"Chấp nhận lời mời"};

/** AU07 — simulated password change + demo session info + end session (shows ST11). */
export function SecurityPage() {
  const { session, signOut } = useSession();
  const end=useCommand(()=>signOut(),{changesAuthentication:true,success:"Đã kết thúc phiên",onSuccess:()=>router.push("/login")});
  const sessions=useRepo(["my-sessions"],ctx=>sessionRepo.sessions(ctx));
  const currentSession=sessions.data?.find(value=>value.current);
  const router = useRouter();
  const me = useRepo(["me"], (ctx) => sessionRepo.me(ctx));
  const [endOpen, setEndOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  return (
    <div className="page">
      {session?.mustChangePassword&&<Callout tone="warning" title="Bắt buộc đổi mật khẩu lần đầu">Đổi mật khẩu tạm thời trước khi sử dụng chức năng nhà trường. Sau khi đổi, đăng nhập lại bằng mật khẩu mới.</Callout>}
      <PageHeader title="Bảo mật và phiên" subtitle="Mật khẩu và phiên làm việc của tài khoản hiện tại" breadcrumbs={[{ label: "Tài khoản", href: "/account/profile" }, { label: "Bảo mật và phiên" }]} badge={<DemoTag />} />
      <div className="grid gap-5 xl:grid-cols-2">
        <ChangePassword email={me.data?.user.email} />
        <Card>
          <CardHeader title="Phiên hiện tại" icon={<MonitorSmartphone className="size-5" />} action={<Badge tone="success">Đang dùng</Badge>} />
          <dl className="divide-y divide-line px-5">
            <InfoRow label="Người dùng">{me.data ? `${me.data.user.fullName} (${me.data.user.email})` : "…"}</InfoRow>
            <InfoRow label="Loại phiên">{session?.actor.kind === "platform" ? "Vận hành nền tảng" : "Nhân sự nhà trường"}</InfoRow>
            <InfoRow label="Bắt đầu lúc">{currentSession ? fmtDateTime(currentSession.createdAt) : "—"}</InfoRow>
            <InfoRow label="Cách vào">{session ? VIA[session.via] ?? session.via : "—"}</InfoRow>
            <InfoRow label="Lưu ở đâu">Cookie bảo mật và phiên trên máy chủ.</InfoRow>
          </dl>
          <div className="space-y-3 p-5">
            <p className="text-[13px] text-muted">Kết thúc phiên sẽ thu hồi phiên trên máy chủ. Bạn cần đăng nhập lại để tiếp tục.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger-soft" icon={<Clock3 className="size-4" />} onClick={() => setEndOpen(true)}>Kết thúc phiên</Button>
              <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => setOutOpen(true)}>Thoát phiên</Button>
            </div>
          </div>
        </Card>
      </div>
      <ConfirmDialog open={endOpen} onOpenChange={setEndOpen} title="Kết thúc phiên" object={me.data?.user.fullName}
        consequence="Phiên hiện tại sẽ được thu hồi trên máy chủ; dữ liệu đã lưu được giữ nguyên."
        confirmLabel="Kết thúc phiên" variant="danger" busy={end.pending} error={end.error?.message} onConfirm={async()=>{await end.run();}} />
      <ConfirmDialog open={outOpen} onOpenChange={setOutOpen} title="Thoát phiên" object={me.data?.user.fullName}
        consequence="Phiên hiện tại sẽ được thu hồi. Bạn quay về màn hình đăng nhập."
        confirmLabel="Thoát phiên" busy={end.pending} error={end.error?.message} onConfirm={async()=>{await end.run();}} />
    </div>
  );
}

function ChangePassword({ email }: { email?: string }) {
  const router=useRouter();
  const command=useCommand((_ctx,current:string,next:string)=>formResult(changeStaffPassword(current,next),{currentPassword:"current",newPassword:"password"}),{changesAuthentication:true,success:"Đã đổi mật khẩu. Vui lòng đăng nhập lại.",onSuccess:()=>router.push("/login"),onError:e=>setErrors(e.fieldErrors??{form:e.message}),});
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
    try { const result=await command.run(current,next); if(result!==undefined) reset(); } finally { setBusy(false); }

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
        <p className="flex items-start gap-2 text-[12.5px] text-muted"><ShieldAlert className="mt-0.5 size-3.5 flex-none" aria-hidden />Đổi mật khẩu sẽ kết thúc các phiên hiện tại. Bạn cần đăng nhập lại.</p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={reset} disabled={!dirty || busy}>Hủy</Button>
          <Button type="submit" variant="primary" loading={busy}>Đổi mật khẩu</Button>
        </div>
      </form>
    </Card>
  );
}
