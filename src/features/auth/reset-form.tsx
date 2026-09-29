"use client";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, CheckCircle2, Clock3, ArrowLeft } from "lucide-react";
import { authDemoRepo, passwordErrors } from "@/lib/repositories/platform-extra";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useUnsavedChanges } from "@/components/ui/guards";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { ErrorSummary } from "@/components/ui/form";
import { EmptyState, QueryState } from "@/components/ui/states";
import { DemoTag } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/formatters";
import { PasswordField, PasswordRules } from "./password-field";

/** AU03 — demo token check + new password form. Nothing is stored. */
export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const q = useRepo(["reset-token", token], () => authDemoRepo.checkResetToken(token));
  return (
    <QueryState query={q} skeleton="none">
      {(t) => t.state === "valid" ? <ResetForm token={token!} expiresAt={t.expiresAt} /> : (
        <EmptyState icon={<Clock3 className="size-6" />} title={t.state === "missing" ? "Thiếu đường dẫn đặt lại" : "Đường dẫn đã hết hạn hoặc đã được dùng"}
          description="Vì an toàn, đường dẫn đặt lại mật khẩu chỉ dùng một lần trong thời gian ngắn. Hãy yêu cầu đường dẫn mới."
          action={<><ButtonLink href="/forgot-password" variant="primary">Yêu cầu đường dẫn mới</ButtonLink><ButtonLink href="/login">Về đăng nhập</ButtonLink></>} />
      )}
    </QueryState>
  );
}

function ResetForm({ token, expiresAt }: { token: string; expiresAt: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const cmd = useCommand((_c, p: string, c: string) => authDemoRepo.completePasswordReset(token, p, c), { silentError: true, onError: (e) => setErrors(e.fieldErrors ?? { form: e.message }) });
  useUnsavedChanges(!done && (!!password || !!confirm));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = passwordErrors(password, confirm);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = await cmd.run(password, confirm);
    setPassword(""); setConfirm("");
    if (r) setDone(true);
  };

  if (done) {
    return (
      <EmptyState icon={<CheckCircle2 className="size-6" />} title="Đã đặt lại mật khẩu (mô phỏng)"
        description="Bản demo không lưu mật khẩu và không có xác thực thật. Bạn có thể quay lại màn hình đăng nhập với email của mình."
        action={<ButtonLink href="/login" variant="primary">Về đăng nhập</ButtonLink>} />
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Callout tone="info" icon={<KeyRound />} title={<>Đường dẫn hợp lệ <DemoTag /></>}>Đường dẫn mẫu có hiệu lực đến {fmtDateTime(expiresAt)}. Đặt mật khẩu mới cho tài khoản nhân sự.</Callout>
      <ErrorSummary errors={errors} labels={{ password: "Mật khẩu mới", confirm: "Nhập lại mật khẩu", form: "Biểu mẫu" }} />
      <PasswordField id="reset-password" label="Mật khẩu mới" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
      <PasswordRules value={password} />
      <PasswordField id="reset-confirm" label="Nhập lại mật khẩu mới" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={cmd.pending}>Đặt lại mật khẩu (mô phỏng)</Button>
        <ButtonLink href="/login" variant="ghost" icon={<ArrowLeft className="size-4" />}>Hủy</ButtonLink>
      </div>
    </form>
  );
}
