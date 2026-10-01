"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, LogIn, Info, Clock3, UserCheck, FlaskConical, MailOpen } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import { isExpired } from "@/lib/api/session";
import { demoNowISO } from "@/lib/calendar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { TextField } from "@/components/ui/form";
import { PasswordField } from "./password-field";
import { destinationFor } from "./destination";

/** AU01 — staff authentication through the API; credentials stay in component state. */
export function LoginForm() {
  const router = useRouter();
  const { session, signIn, signOut } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);

  const login = useCommand((_ctx, e: string, p: string) => sessionRepo.demoLogin(e, p), {
    silentError: true, changesAuthentication: true,
    onError: (err) => {
      if (err.fieldErrors) { setErrors(err.fieldErrors); setFormError(null); return; }
      setErrors({});
      // Generic message: never say which of email/password was wrong.
      setFormError(err.code === "VALIDATION" ? "Email hoặc mật khẩu không đúng. Kiểm tra lại, hoặc dùng email trong lời mời của nhà trường." : err.message);
    },
  });
  const logout = useCommand(() => signOut(), {changesAuthentication:true, silentError:true, onError:e=>setFormError(e.message)});

  const expired = mounted && !!session && isExpired(session, demoNowISO());
  const active = mounted && !!session && !expired && session.actor.kind !== "anonymous";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Vui lòng nhập email công việc";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Email chưa đúng định dạng";
    if (!password) next.password = "Vui lòng nhập mật khẩu";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) { emailRef.current?.focus(); return; }
    const r = await login.run(email, password);
    if (!r) return;
    setPassword("");
    const actor = r.isPlatform ? { kind: "platform" as const, userId: r.userId } : { kind: "staff" as const, userId: r.userId };
    setRouting(true);
    signIn(actor, "login");
    router.push(await destinationFor(actor));
  };

  const resume = async () => {
    if (!session) return;
    setRouting(true);
    router.push(await destinationFor(session.actor));
  };

  return (
    <div className="space-y-4">
      {expired && (
        <Callout tone="warning" icon={<Clock3 />} title="Phiên trước đã hết">
          Vì an toàn, hãy đăng nhập lại. Nội dung đang soạn trong biểu mẫu (nếu có) được giữ trên trình duyệt ở mức cho phép.
        </Callout>
      )}
      {active && (
        <Callout tone="info" icon={<UserCheck />} title="Bạn đang trong một phiên làm việc"
          action={<div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" loading={routing} onClick={resume}>Tiếp tục</Button><Button size="sm" variant="ghost" loading={logout.pending} onClick={() => logout.run()}>Thoát phiên</Button></div>}>
          Có thể tiếp tục vào không gian đang mở hoặc thoát để đăng nhập bằng email khác.
        </Callout>
      )}

      <form onSubmit={submit} noValidate className="space-y-4" aria-describedby={formError ? "login-error" : undefined}>
        {formError && <div id="login-error"><Callout tone="danger" title="Không đăng nhập được">{formError}</Callout></div>}
        <TextField ref={emailRef} label="Email công việc" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          error={errors.email} icon={<Mail className="size-4" />} placeholder="ten@truong.edu.test" />
        <PasswordField id="login-password" label="Mật khẩu" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password}
          labelAction={<Link href="/forgot-password" className="text-[13px] font-semibold text-primary-strong hover:underline">Quên mật khẩu?</Link>}
          helper="Nhập mật khẩu của tài khoản nhân sự." />
        <Button type="submit" variant="primary" size="lg" block loading={login.pending || routing} icon={<LogIn className="size-4" />}>
          {routing ? "Đang mở không gian…" : "Đăng nhập"}
        </Button>
      </form>

      <Callout tone="neutral" icon={<Info />} title="Chưa có tài khoản?">
        Tài khoản nhân sự do nhà trường mời và phân công, không có đăng ký tự do. Nếu đã nhận lời mời, hãy mở đường dẫn trong lời mời để chấp nhận.

      </Callout>

      <div className="flex justify-center"><ButtonLink href="/help" variant="ghost" size="sm">Cần trợ giúp đăng nhập?</ButtonLink></div>
    </div>
  );
}
