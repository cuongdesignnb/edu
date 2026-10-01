import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/features/auth/auth-frame";
import { ResetPasswordForm } from "@/features/auth/reset-form";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

/** AU03 — one-use password reset challenge from the delivered email. */
export default function ResetPasswordPage() {
  return (
    <AuthFrame title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới cho tài khoản nhân sự. Đường dẫn chỉ sử dụng được một lần.">
      <Suspense fallback={null}><ResetPasswordForm /></Suspense>
    </AuthFrame>
  );
}
