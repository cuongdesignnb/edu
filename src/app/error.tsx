"use client";
import { RefreshCw, Home, AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { StatusScreen } from "@/features/system/status-screen";

/** SY08 / ST28 — route error boundary. Friendly message + retry; never shows the stack trace. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusScreen icon={<AlertTriangle />} tone="pink" code="Đã có lỗi" title="Trang chưa hiển thị được"
      description="Đã có lỗi không mong muốn khi hiển thị trang này. Dữ liệu đã lưu không bị ảnh hưởng; nội dung đang soạn (nếu có) được giữ ở mức cho phép."
      actions={<>
        <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => reset()}>Thử lại</Button>
        <ButtonLink href="/" icon={<Home className="size-4" />}>Về trang chính</ButtonLink>
      </>}>
      <Callout tone="neutral">Nếu lỗi lặp lại, hãy ghi lại thời điểm và thao tác vừa làm rồi báo cho đầu mối quản trị của trường.</Callout>
    </StatusScreen>
  );
}
