"use client";
import Link from "next/link";
import { School, CheckCircle2, Users, Link2, Clock, LifeBuoy, ArrowRight, Building, PlusCircle, PauseCircle, ShieldCheck, Settings } from "lucide-react";
import { platformRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtNumber, fmtPercent, fmtRelative } from "@/lib/formatters";
import { demoNowISO } from "@/lib/demo/clock";
import { PageHeader } from "@/components/layout/page";
import { KpiCard } from "@/components/data/kpi";
import { Card, CardHeader, CardLink } from "@/components/ui/card";
import { QueryState } from "@/components/ui/states";
import { SchoolsTable } from "@/features/platform/schools-table";

const ROLES = [
  { img: "role-platform", title: "Chủ nền tảng", tone: "text-primary-strong", text: "Tạo trường, chỉ định quản trị, theo dõi vận hành và hỗ trợ khi trường cho phép.", href: "/help#nen-tang" },
  { img: "role-school", title: "Nhà trường", tone: "text-success-text", text: "Không gian riêng: năm học, lớp, giáo viên, học sinh và quy trình công bố.", href: "/help#nha-truong" },
  { img: "role-teacher", title: "Giáo viên", tone: "text-primary-strong", text: "Làm việc trong đúng lớp/môn được phân công, theo thời gian hiệu lực.", href: "/help#giao-vien" },
  { img: "role-parent", title: "Phụ huynh", tone: "text-danger-text", text: "Xem thông tin đã công bố của con qua link riêng, không cần tài khoản.", href: "/help#phu-huynh" },
];

function eventIcon(action: string) {
  if (action.includes("Kích hoạt")) return { icon: <PlusCircle className="size-4" />, tone: "tone-green" };
  if (action.includes("Tạm dừng") || action.includes("Lưu trữ")) return { icon: <PauseCircle className="size-4" />, tone: "tone-amber" };
  if (action.includes("hỗ trợ")) return { icon: <ShieldCheck className="size-4" />, tone: "tone-purple" };
  if (action.includes("cấu hình")) return { icon: <Settings className="size-4" />, tone: "tone-blue" };
  return { icon: <Building className="size-4" />, tone: "tone-blue" };
}

/** PL01 — Platform overview (R01). Operational data only; no drill-down into student records. */
export default function PlatformOverview() {
  const q = useRepo(["platform-overview"], (ctx) => platformRepo.overview(ctx));
  return (
    <QueryState query={q}>
      {(d) => (
        <div className="page">
          <PageHeader title="Quản lý nền tảng" subtitle="Tổng quan vận hành của các trường trên EduManage" quote={["Công nghệ kết nối", "Những giá trị giáo dục bền vững"]} illustration="/assets/illustrations/school-header.png" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Tổng số trường" value={fmtNumber(d.totalSchools)} icon={<School className="size-7" />} tone="blue" hint={`${d.draftSchools} chờ kích hoạt · ${d.suspendedSchools} tạm dừng`} />
            <KpiCard label="Trường đang hoạt động" value={fmtNumber(d.activeSchools)} icon={<CheckCircle2 className="size-7" />} tone="green" hint={`${fmtPercent(d.activeSchools, d.totalSchools, 1)} tổng số trường`} />
            <KpiCard label="Nhân sự đang hoạt động" value={fmtNumber(d.activeStaff)} icon={<Users className="size-7" />} tone="blue" hint="Thành viên của các trường đang hoạt động" />
            <KpiCard label="Lượt mở link tra cứu" value={fmtNumber(d.linkOpens30d)} icon={<Link2 className="size-7" />} tone="pink" hint="30 ngày qua · chỉ số tổng hợp, không danh tính" />
          </div>
          <Card as="div" className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Bốn khu vực người dùng">
            {ROLES.map((r) => (
              <div key={r.title} className="flex gap-3 rounded-xl p-2">
                <img src={`/assets/illustrations/${r.img}.png`} alt="" className="size-[76px] flex-none rounded-2xl object-cover" />
                <div className="min-w-0">
                  <p className={`text-[16px] font-bold ${r.tone}`}>{r.title}</p>
                  <p className="mt-1 text-[13px] leading-snug text-body">{r.text}</p>
                  <Link href={r.href} className="card-link mt-1.5">Tìm hiểu thêm <ArrowRight className="size-3.5" aria-hidden /></Link>
                </div>
              </div>
            ))}
          </Card>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader title="Danh sách trường học" icon={<School className="size-6" />} action={<CardLink href="/platform/schools">Quản lý tất cả</CardLink>} />
              <SchoolsTable />
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader title="Hoạt động gần đây" icon={<Clock className="size-5" />} action={<CardLink href="/platform/audit" />} />
                <ul className="space-y-3.5 px-5 pb-5">
                  {d.recent.map((e) => {
                    const ic = eventIcon(e.action);
                    return (
                      <li key={e.id} className="flex gap-3">
                        <span className={`icon-tile icon-tile-sm !size-9 !rounded-full ${ic.tone}`}>{ic.icon}</span>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium leading-snug text-ink">{e.action}: {e.entityLabel}</p>
                          <p className="text-[12px] text-muted">{e.actorName} · {fmtRelative(e.at, demoNowISO())}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <Link href="/platform/support" className="card flex items-center gap-4 bg-gradient-to-br from-[#e8f3ff] to-white p-5 hover:border-[#9cc7f5]">
                <span className="icon-tile tone-blue"><LifeBuoy className="size-7" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-ink">{d.openTickets} yêu cầu hỗ trợ đang mở</span><span className="block text-[13px] text-muted">Hỗ trợ dữ liệu chỉ trong phạm vi và thời hạn nhà trường cho phép.</span></span>
                <ArrowRight className="size-5 text-primary" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      )}
    </QueryState>
  );
}
