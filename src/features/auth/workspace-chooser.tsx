"use client";
import Link from "next/link";
import { Building2, GraduationCap, Presentation, Lock, PauseCircle, Crown, ArrowRight, Hourglass, Info } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import type { Workspace } from "@/lib/repositories/session";
import { useRepo } from "@/lib/query/hooks";
import { membershipStatus, schoolStatus } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SchoolMark } from "@/components/ui/avatar";
import { EmptyState, QueryState } from "@/components/ui/states";

/** AU05 — only schools where the person is a member; entry buttons only when the workspace really exists. */
export function WorkspaceChooser() {
  const q = useRepo(["me"], (ctx) => sessionRepo.me(ctx));
  return (
    <QueryState query={q} skeleton="cards">
      {(me) => {
        const usable = me.workspaces.filter((w) => usableState(w) === "ok").length;
        return (
          <div className="page">
            <PageHeader title="Chọn không gian làm việc" subtitle={`Xin chào ${me.user.honorific ? `${me.user.honorific} ` : ""}${me.user.fullName}. Chọn trường và khu vực làm việc phù hợp với nhiệm vụ được giao.`}
              quote={["Mỗi trường một không gian", "Đúng người, đúng lớp, đúng môn"]} illustration="/assets/illustrations/school-header.png" />
            {me.isPlatform && (
              <Card className="flex flex-wrap items-center gap-4 p-5">
                <span className="icon-tile tone-blue" aria-hidden><Crown className="size-6" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-bold text-ink">Vận hành nền tảng</p>
                  <p className="text-[13.5px] text-body">Quản lý trường, quản trị trường, hỗ trợ và nhật ký vận hành. Không mặc định mở hồ sơ học sinh của trường.</p>
                </div>
                <ButtonLink href="/platform" variant="primary" iconRight={<ArrowRight className="size-4" />}>Vào khu vực vận hành</ButtonLink>
              </Card>
            )}
            {me.workspaces.length === 0 && !me.isPlatform && (
              <Card><EmptyState icon={<Building2 className="size-6" />} title="Bạn chưa là thành viên của trường nào" description="Nhân sự chỉ vào được trường đã mời mình. Hãy kiểm tra email lời mời hoặc liên hệ quản trị của trường." action={<ButtonLink href="/account/no-access">Tìm hiểu thêm</ButtonLink>} /></Card>
            )}
            {me.workspaces.length > 0 && (
              <>
                <p className="text-sm text-muted" aria-live="polite">{usable} / {me.workspaces.length} không gian có thể mở ngay.</p>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {me.workspaces.map((w) => <WorkspaceCard key={w.membershipId} w={w} />)}
                </div>
              </>
            )}
            <Callout tone="neutral" icon={<Info />}>Phân công lớp, môn và vai trò do nhà trường quản lý. Bạn không tự thêm trường hoặc tự nâng quyền; nếu thiếu không gian cần thiết, hãy liên hệ quản trị trường.</Callout>
          </div>
        );
      }}
    </QueryState>
  );
}

type UsableState = "ok" | "membership" | "school" | "draft" | "unassigned";
function usableState(w: Workspace): UsableState {
  if (w.membershipStatus !== "active") return "membership";
  if (w.school.status === "draft") return "draft";
  if (w.school.status !== "active") return "school";
  if (!w.schoolWorkspace && !w.teacherWorkspace) return "unassigned";
  return "ok";
}

function WorkspaceCard({ w }: { w: Workspace }) {
  const st = usableState(w);
  const disabled = st !== "ok";
  return (
    <Card as="article" className={disabled ? "bg-[#fafcff] p-5" : "p-5"} aria-label={w.school.name}>
      <div className="flex items-start gap-3">
        <SchoolMark name={w.school.name} size={44} color={disabled ? "#8a9bb6" : "#0a72e6"} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-ink">{w.school.name}</h2>
          <p className="text-[13px] text-muted">{w.department}{w.roleNames.length ? ` · ${w.roleNames.join(", ")}` : ""}</p>
        </div>
        {disabled && <Lock className="size-4 flex-none text-muted" aria-label="Không mở được" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone={schoolStatus[w.school.status].tone}>Trường: {schoolStatus[w.school.status].label.toLowerCase()}</Badge>
        <Badge tone={membershipStatus[w.membershipStatus as keyof typeof membershipStatus].tone}>Thành viên: {membershipStatus[w.membershipStatus as keyof typeof membershipStatus].label.toLowerCase()}</Badge>
      </div>
      <div className="mt-3">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">{w.membershipStatus === "active" ? "Nhiệm vụ đang hiệu lực" : "Nhiệm vụ đã giao (tạm ngưng theo thành viên)"}</p>
        {w.duties.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">{w.duties.slice(0, 6).map((d) => <li key={d}><Badge tone="info" dot={false}>{d}</Badge></li>)}{w.duties.length > 6 && <li><Badge tone="neutral" dot={false}>+{w.duties.length - 6} nhiệm vụ</Badge></li>}</ul>
        ) : <p className="mt-1 text-[13px] text-muted">{w.roleNames.length ? "Chỉ có vai trò cấp trường." : "Chưa có lớp/môn được giao."}</p>}
      </div>

      {st === "ok" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {w.schoolWorkspace && <ButtonLink href={`/school/${w.school.id}`} variant="primary" icon={<Presentation className="size-4" />}>Quản lý nhà trường</ButtonLink>}
          {w.teacherWorkspace && <ButtonLink href={`/teacher/${w.school.id}`} variant={w.schoolWorkspace ? "secondary" : "primary"} icon={<GraduationCap className="size-4" />}>Lớp học của tôi</ButtonLink>}
        </div>
      )}
      {st === "membership" && (
        <Callout className="mt-4" tone="warning" icon={<Lock />} title={w.membershipStatus === "revoked" ? "Thành viên đã bị thu hồi" : "Thành viên đang tạm khóa"}>
          Bạn không mở được không gian của trường này. Dữ liệu đã ghi trước đây vẫn thuộc nhà trường. <Link href="/account/no-access" className="font-semibold underline">Vì sao?</Link>
        </Callout>
      )}
      {st === "school" && (
        <Callout className="mt-4" tone="warning" icon={<PauseCircle />} title={w.school.status === "archived" ? "Trường đã lưu trữ" : "Trường đang tạm dừng"}>
          Thao tác nghiệp vụ tạm khóa, dữ liệu không bị xóa. <Link href={`/school-suspended?school=${w.school.slug}`} className="font-semibold underline">Xem giải thích</Link>
        </Callout>
      )}
      {st === "draft" && (
        <Callout className="mt-4" tone="neutral" icon={<Hourglass />} title="Trường chờ kích hoạt">Nền tảng sẽ kích hoạt khi hồ sơ trường và quản trị đầu tiên sẵn sàng.</Callout>
      )}
      {st === "unassigned" && (
        <Callout className="mt-4" tone="info" icon={<Info />} title="Chưa được phân công">
          Bạn là thành viên nhưng chưa có lớp/môn hay vai trò đang hiệu lực. <Link href="/account/no-access" className="font-semibold underline">Tìm hiểu thêm</Link>
        </Callout>
      )}
    </Card>
  );
}
