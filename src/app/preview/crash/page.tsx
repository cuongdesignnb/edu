"use client";
import { useEffect, useState } from "react";
import { Bug, AlertOctagon } from "lucide-react";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IS_DEMO } from "@/lib/demo/session";
import { armGlobalCrash } from "@/lib/demo/crash";

/**
 * Internal demo only: deliberately triggers the route error boundary (app/error.tsx)
 * and the last-resort boundary (app/global-error.tsx) so ST28 can be verified for real.
 * `?now=1` throws on first render (used by E2E).
 */
function Boom(): never {
  throw new Error("Lỗi hiển thị mô phỏng (demo)");
}

export default function CrashLab() {
  const [crash, setCrash] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("now") === "1") setCrash(true); }, []);
  if (!IS_DEMO) return <p className="p-6">Chỉ có trong chế độ demo.</p>;
  if (crash) return <Boom />;
  return (
    <div className="page">
      <Card>
        <CardHeader title="Kiểm tra ranh giới lỗi (ST28)" icon={<Bug className="size-5" />} subtitle="Công cụ nội bộ demo — gây lỗi có chủ đích để xem trang lỗi thật" />
        <div className="space-y-3 px-5 pb-5">
          <Callout tone="warning">Chỉ dùng để nghiệm thu. Không ảnh hưởng dữ liệu demo đã lưu.</Callout>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Bug className="size-4" />} onClick={() => setCrash(true)}>Gây lỗi trong trang (error.tsx)</Button>
            <Button variant="danger-soft" icon={<AlertOctagon className="size-4" />} onClick={() => { armGlobalCrash(); window.location.reload(); }}>Gây lỗi toàn ứng dụng (global-error.tsx)</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
