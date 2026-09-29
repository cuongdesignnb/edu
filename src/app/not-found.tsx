"use client";
import { useRouter } from "next/navigation";
import { FileQuestion, ArrowLeft, Home, BookOpenText } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusScreen } from "@/features/system/status-screen";

/** SY08 / ST28 — not found. */
export default function NotFound() {
  const router = useRouter();
  return (
    <StatusScreen icon={<FileQuestion />} code="Lỗi 404" title="Không tìm thấy trang"
      description="Đường dẫn có thể đã thay đổi, bị gõ nhầm hoặc nội dung không còn thuộc phạm vi của bạn."
      actions={<>
        <ButtonLink href="/" variant="primary" icon={<Home className="size-4" />}>Về trang chính</ButtonLink>
        <Button icon={<ArrowLeft className="size-4" />} onClick={() => router.back()}>Quay lại</Button>
        <ButtonLink href="/help" variant="ghost" icon={<BookOpenText className="size-4" />}>Hướng dẫn sử dụng</ButtonLink>
      </>} />
  );
}
