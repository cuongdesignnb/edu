"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldOff, PauseCircle, Wrench, RefreshCw, ArrowLeft, Home, School, Mail, Phone, CheckCircle2, HelpCircle, LogIn } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import { authDemoRepo } from "@/lib/repositories";
import { useRepo, useSession } from "@/lib/query/hooks";
import { schoolStatus } from "@/lib/formatters";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { StatusBadge, DemoTag } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/states";
import { StatusScreen } from "./status-screen";
import { useHasLiveSession } from "./adaptive-shell";

function useHome() {
  const { actor } = useSession();
  const live = useHasLiveSession();
  if (!live) return { href: "/login", label: "Đăng nhập nhân sự", icon: <LogIn className="size-4" /> };
  return actor.kind === "platform" ? { href: "/platform", label: "Về khu vực vận hành", icon: <Home className="size-4" /> } : { href: "/choose-school", label: "Chọn không gian hợp lệ", icon: <School className="size-4" /> };
}

/** SY05 — access denied. Says nothing about the forbidden resource. */
export function AccessDenied() {
  const router = useRouter();
  const home = useHome();
  const live = useHasLiveSession();
  return (
    <StatusScreen icon={<ShieldOff />} tone="amber" code="Không có quyền truy cập" title="Bạn không có quyền mở trang này"
      description={<>Trang hoặc dữ liệu vừa yêu cầu nằm ngoài phạm vi được nhà trường giao cho bạn, hoặc quyền đã thay đổi. Vì an toàn, hệ thống không hiển thị thêm thông tin về nội dung bị chặn.</>}
      actions={<>
        <ButtonLink href={home.href} variant="primary" icon={home.icon}>{home.label}</ButtonLink>
        <Button icon={<ArrowLeft className="size-4" />} onClick={() => router.back()}>Quay lại</Button>
        {live && <ButtonLink href="/account/no-access" variant="ghost" icon={<HelpCircle className="size-4" />}>Vì sao tôi bị chặn?</ButtonLink>}
      </>}>
      <Callout tone="neutral">Bạn không thể tự nâng quyền. Nếu cần truy cập, hãy liên hệ đầu mối quản trị của trường.</Callout>
    </StatusScreen>
  );
}

/** SY06 — school suspended (ST13). Operational explanation, public contact, no write actions. */
export function SchoolSuspended() {
  const slug = useSearchParams().get("school");
  const live = useHasLiveSession();
  const { actor } = useSession();
  const school = useRepo(["school-status", slug], () => authDemoRepo.schoolStatusBySlug(slug!), { enabled: !!slug });
  const me = useRepo(["me"], (ctx) => sessionRepo.me(ctx), { enabled: live && actor.kind === "staff" });
  const others = (me.data?.workspaces ?? []).filter((w) => w.school.slug !== slug && w.membershipStatus === "active" && w.school.status === "active" && (w.schoolWorkspace || w.teacherWorkspace));
  const s = school.data;
  return (
    <StatusScreen icon={<PauseCircle />} tone="amber" code="Trường tạm dừng" title={s ? `${s.name} đang tạm dừng hoạt động` : "Trường đang tạm dừng hoạt động"}
      description={<>Thao tác nghiệp vụ và đường dẫn tra cứu của phụ huynh tạm khóa. <b>Dữ liệu được giữ nguyên, không bị xóa.</b> Đây là quyết định vận hành, không liên quan đến thanh toán.</>}
      actions={<>
        {live ? <ButtonLink href="/choose-school" variant="primary" icon={<School className="size-4" />}>Chọn trường khác</ButtonLink> : <ButtonLink href="/login" variant="primary" icon={<LogIn className="size-4" />}>Đăng nhập nhân sự</ButtonLink>}
        <ButtonLink href="/help#nen-tang" icon={<HelpCircle className="size-4" />}>Tìm hiểu về tạm dừng</ButtonLink>
      </>}>
      <div className="space-y-3">
        {slug && school.isLoading && <Skeleton className="h-20" />}
        {s && (
          <div className="rounded-xl border border-line p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 flex-1 font-semibold text-ink">{s.name}</p><StatusBadge status={s.status} map={schoolStatus} /></div>
            <p className="mt-2 font-semibold text-ink">Đầu mối công khai của trường</p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body"><span className="flex items-center gap-1.5"><Mail className="size-4 text-primary" aria-hidden />{s.publicEmail}</span><span className="flex items-center gap-1.5"><Phone className="size-4 text-primary" aria-hidden />{s.publicPhone}</span></p>
          </div>
        )}
        {school.error && <Callout tone="neutral">Không tìm thấy thông tin trường theo đường dẫn này.</Callout>}
        {others.length > 0 && (
          <div className="rounded-xl border border-line p-4">
            <p className="text-sm font-semibold text-ink">Bạn vẫn có thể làm việc ở</p>
            <ul className="mt-2 space-y-2">
              {others.map((w) => (
                <li key={w.membershipId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 text-body">{w.school.name}</span>
                  {w.schoolWorkspace && <ButtonLink size="sm" href={`/school/${w.school.id}`}>Quản lý nhà trường</ButtonLink>}
                  {w.teacherWorkspace && <ButtonLink size="sm" href={`/teacher/${w.school.id}`}>Lớp học của tôi</ButtonLink>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </StatusScreen>
  );
}

/** SY07 — simulated maintenance: retry probes the local demo store; no ETA is promised. */
export function Maintenance() {
  const home = useHome();
  const [state, setState] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const retry = async () => {
    setState("checking");
    try { await authDemoRepo.healthCheck(); setState("ok"); } catch { setState("fail"); }
  };
  return (
    <StatusScreen icon={<Wrench />} tone="purple" code="Bảo trì mô phỏng" title="Hệ thống đang bảo trì"
      description={<>Một số chức năng tạm ngừng để bảo trì. Chúng tôi chưa thể đưa ra thời gian hoàn tất chính xác; hãy thử lại sau ít phút. Dữ liệu đã lưu không bị ảnh hưởng. <DemoTag /></>}
      actions={<>
        <Button variant="primary" icon={<RefreshCw className="size-4" />} loading={state === "checking"} onClick={retry}>Thử lại</Button>
        <ButtonLink href={home.href} icon={home.icon}>{home.label}</ButtonLink>
      </>}>
      <div aria-live="polite">
        {state === "ok" && <Callout tone="success" icon={<CheckCircle2 />} title="Kết nối lại được (mô phỏng)">Kho dữ liệu demo trên trình duyệt đang hoạt động. Bạn có thể quay lại nơi làm việc.</Callout>}
        {state === "fail" && <Callout tone="danger" title="Vẫn chưa kết nối được (mô phỏng)">Hãy thử lại sau. Nội dung bạn đang soạn (nếu có) vẫn được giữ trên trình duyệt.</Callout>}
        {state === "idle" && <Callout tone="neutral">Trang này minh họa trạng thái bảo trì. Bản demo không có máy chủ thật để kiểm tra.</Callout>}
      </div>
    </StatusScreen>
  );
}
