"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail, Send, MailCheck, ArrowLeft, FlaskConical } from "lucide-react";
import { authDemoRepo } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { TextField } from "@/components/ui/form";
import { DemoTag } from "@/components/ui/badge";

/** AU02 — the server queues reset delivery without disclosing identity existence. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const cmd = useCommand((_c, e: string) => authDemoRepo.requestPasswordReset(e), {  onError: (e) => setError(e.fieldErrors?.email ?? e.message) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError("Vui lòng nhập email công việc");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Email chưa đúng định dạng");
    setError(undefined);
    const r = await cmd.run(email);
    if (r) setDone(true);
  };

  if (done) {
    return (
      <div className="space-y-4" role="status">
        <div className="flex items-start gap-3 rounded-xl border border-[#bfe8d6] bg-success-bg p-4">
          <span className="icon-tile tone-green !size-11 flex-none" aria-hidden><MailCheck className="size-5" /></span>
          <div className="text-[14px] text-success-text">
            <p className="font-semibold">Đã ghi nhận yêu cầu <DemoTag /></p>
            <p className="mt-1">Nếu email này thuộc một nhân sự đang được nhà trường cấp quyền, hướng dẫn đặt lại mật khẩu sẽ được gửi tới hộp thư đó.</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setDone(false); setEmail(""); }}>Nhập email khác</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField label="Email công việc" type="email" required autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error}
        icon={<Mail className="size-4" />} helper="Kết quả luôn giống nhau để không tiết lộ email nào có tài khoản." />
      <Button type="submit" variant="primary" size="lg" block loading={cmd.pending} icon={<Send className="size-4" />}>Gửi hướng dẫn</Button>
      <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline"><ArrowLeft className="size-4" aria-hidden />Quay lại đăng nhập</Link>
    </form>
  );
}
