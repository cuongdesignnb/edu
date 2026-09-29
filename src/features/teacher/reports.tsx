"use client";
import Link from "next/link";
import { BarChart3, FileBarChart, ArrowRight, Download } from "lucide-react";
import { reportsRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, IconTile, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, QueryState } from "@/components/ui/states";

/** TE06 — reports the teacher may open, grouped by assigned class (homeroom vs subject scope). */
export function TeacherReports({ schoolId }: { schoolId: string }) {
  const q = useRepo(["teacher-reports", schoolId], (ctx) => reportsRepo.teacherCatalog(ctx, schoolId));
  return (
    <div className="page">
      <PageHeader title="Báo cáo được phép" subtitle="Báo cáo theo lớp được giao — phạm vi chủ nhiệm hoặc bộ môn"
        breadcrumbs={[{ label: "Việc hôm nay", href: `/teacher/${schoolId}` }, { label: "Báo cáo" }]} illustration="/assets/illustrations/activity-trophy.png" />
      <Callout tone="info" icon={<BarChart3 />}>Giáo viên bộ môn chỉ mở báo cáo chuyên cần và hoạt động của lớp mình dạy. Xuất dữ liệu chỉ hiện với lớp có quyền “Xuất báo cáo lớp”.</Callout>
      <QueryState query={q} skeleton="cards">
        {(list) => list.length === 0 ? <Card><EmptyState title="Chưa có báo cáo được phép" description="Bạn cần được phân công lớp còn hiệu lực để xem báo cáo." /></Card> : (
          <div className="grid gap-5 lg:grid-cols-2">
            {list.map((c) => (
              <Card key={c.classId}>
                <CardHeader title={`Lớp ${c.className}`} icon={<FileBarChart className="size-5 text-primary" />} action={<><Badge tone="info" dot={false}>{c.role}</Badge>{c.canExport ? <Badge tone="success" icon={<Download className="size-3" />}>Được xuất dữ liệu</Badge> : <Badge tone="neutral">Chỉ xem</Badge>}</>} />
                {c.reports.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Không có báo cáo trong phạm vi phân công.</p> : (
                  <ul className="space-y-2 px-5 pb-5">
                    {c.reports.map((r) => (
                      <li key={r.type}>
                        <Link href={`/classroom/${schoolId}/${c.yearId}/${c.classId}/reports/${r.type}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-[#9cc7f5] hover:bg-[#f7fbff]">
                          <IconTile tone="blue" size="sm"><BarChart3 className="size-5" /></IconTile>
                          <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{r.title}</span><span className="block text-[13px] text-muted">{r.description}</span></span>
                          <ArrowRight className="size-4 flex-none text-primary" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
