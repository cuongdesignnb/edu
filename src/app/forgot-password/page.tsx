import type { Metadata } from "next";
import { AuthFrame } from "@/features/auth/auth-frame";
import { ForgotPasswordForm } from "@/features/auth/forgot-form";

export const metadata: Metadata = { title: "Quên mật khẩu" };

/** AU02 — a generic server response does not disclose identity existence. */
export default function ForgotPasswordPage() {
  return (
    <AuthFrame title="Quên mật khẩu" subtitle="Nhập email công việc. Nếu email thuộc nhân sự được nhà trường cấp quyền, hướng dẫn đặt lại sẽ được gửi tới hộp thư đó.">
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
