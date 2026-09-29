"use client";
import Link from "next/link";
import { ShieldOff, Lock, UserX, Building2, Mail, ArrowRight, HelpCircle } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { membershipStatus, schoolStatus } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { QueryState } from "@/components/ui/states";

/** AU08 — explains why a school/class is no longer accessible; never reveals the forbidden data. */
export function NoAccessPage() {
  const q = useRepo(["me"], (ctx) => sessionRepo.me(ctx));
  return (
    <QueryState query={q} skeleton="detail">
      {(me) => {
        const blocked = me.workspaces.filter((w) => w.membershipStatus !== "active" || w.school.status !== "active" || (!w.schoolWorkspace && !w.teacherWorkspace));
        const usable = me.workspaces.length - blocked.length;
        return (
          <div className="page">
            <PageHeader title="Chưa được phân công hoặc đã bị thu hồi quyền" subtitle="Vì sao bạn không mở được trường, lớp hoặc mục vừa chọn" breadcrumbs={[{ label: "Tài khoản", href: "/account/profile" }, { label: "Không còn quyền truy cập" }]} />
            <Card className="p-5">
              <div className="flex flex-wrap items-start gap-4">
                <span className="icon-tile tone-amber" aria-hidden><ShieldOff className="size-6" /></span>
                <div className="min-w-0 flex-[1_1_320px] space-y-2 text-[14px] text-body">
                  <p className="text-[16px] font-bold text-ink">Quyền làm việc được cấp theo nhiệm vụ, lớp/môn và thời gian hiệu lực</p>
                  <p>Bạn chỉ mở được lớp hoặc mục mà nhà trường đang giao cho bạn. Khi phân công kết thúc, được bàn giao cho người khác, hoặc thành viên trường bị tạm khóa/thu hồi, các lần mở mới sẽ bị chặn — kể cả trên trang đang mở.</p>
                  <p>Màn hình này không hiển thị nội dung của mục bị chặn. Dữ liệu bạn đã ghi trước đây vẫn thuộc nhà trường và không bị xóa.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href="/choose-school" variant="primary" iconRight={<ArrowRight className="size-4" />}>Chọn không gian hợp lệ ({usable})</ButtonLink>
                <ButtonLink href="/help#giao-vien" icon={<HelpCircle className="size-4" />}>Xem hướng dẫn phân quyền</ButtonLink>
              </div>
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Trường có giới hạn truy cập" icon={<Lock className="size-5" />} subtitle={`${blocked.length} trường`} />
                <ul className="space-y-3 px-5 pb-5">
                  {blocked.length === 0 && <li className="text-sm text-muted">Hiện mọi trường bạn tham gia đều mở được. Nếu vừa gặp thông báo chặn, có thể phân công của một lớp/môn cụ thể đã thay đổi.</li>}
                  {blocked.map((w) => (
                    <li key={w.membershipId} className="rounded-xl border border-line p-3.5">
                      <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 flex-1 font-semibold text-ink">{w.school.name}</p><StatusBadge status={w.membershipStatus} map={membershipStatus} /></div>
                      <p className="mt-1 text-[13px] text-body">
                        {w.membershipStatus !== "active" ? (w.membershipStatus === "revoked" ? "Thành viên đã bị thu hồi." : "Thành viên đang tạm khóa.")
                          : w.school.status !== "active" ? <>Trường {schoolStatus[w.school.status].label.toLowerCase()}. <Link className="font-semibold text-primary-strong underline" href={`/school-suspended?school=${w.school.slug}`}>Xem giải thích</Link></>
                          : "Chưa có lớp/môn hay vai trò đang hiệu lực."}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Cần làm gì tiếp theo?" icon={<UserX className="size-5" />} />
                <ol className="list-decimal space-y-2 px-5 pb-5 pl-10 text-[14px] text-body">
                  <li>Kiểm tra bạn đang mở đúng trường và năm học.</li>
                  <li>Liên hệ đầu mối quản trị của trường (giáo vụ hoặc quản trị trường) để xác nhận phân công.</li>
                  <li>Nếu được giao lại, mở lại không gian từ “Chọn không gian làm việc”. Bạn không thể tự nâng quyền.</li>
                </ol>
                <div className="px-5 pb-5"><Callout tone="neutral" icon={<Mail />}>Nền tảng không cấp quyền thay nhà trường. <Link href="/help#nha-truong" className="font-semibold underline">Quy trình phân công</Link></Callout></div>
              </Card>
            </div>
            <Callout tone="info" icon={<Building2 />}>Đang dùng tài khoản: {me.user.fullName} ({me.user.email}).</Callout>
          </div>
        );
      }}
    </QueryState>
  );
}
