import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/features/auth/auth-frame";
import { ResetPasswordForm } from "@/features/auth/reset-form";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

/** AU03 — reset password with a demo token (demo-valid / demo-expired). */
export default function ResetPasswordPage() {
  return (
    <AuthFrame title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới cho tài khoản nhân sự. Bản demo chỉ kiểm tra biểu mẫu, không lưu mật khẩu.">
      <Suspense fallback={null}><ResetPasswordForm /></Suspense>
    </AuthFrame>
  );
}
