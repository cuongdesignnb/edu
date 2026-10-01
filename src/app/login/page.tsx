import type { Metadata } from "next";
import { AuthFrame } from "@/features/auth/auth-frame";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Đăng nhập nhân sự" };

/** AU01 — staff cookie authentication. No self-registration. */
export default function LoginPage() {
  return (
    <AuthFrame title="Đăng nhập nhân sự" subtitle="Dành cho quản trị, ban giám hiệu, giáo vụ và giáo viên đã được nhà trường mời.">
      <LoginForm />
    </AuthFrame>
  );
}
