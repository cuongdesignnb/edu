"use client";
import { useState } from "react";
import { Users, BookOpen, MapPin, CalendarDays, History } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { teacherExtraRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateLong, classStatus } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Toggle } from "@/components/ui/form";
import { EmptyState, QueryState } from "@/components/ui/states";

/** TE02 — classes assigned to the teacher: live by default, ended assignments on request. */
export function TeacherClasses({ schoolId }: { schoolId: string }) {
  const [ended, setEnded] = useState(false);
  const q = useRepo(["teacher-classes", schoolId, ended], (ctx) => classroomRepo.teacherClasses(ctx, schoolId, ended));
  const acts = useRepo(["teacher-class-actions", schoolId], (ctx) => teacherExtraRepo.myClassActions(ctx, schoolId));
  return (
    <div className="page">
      <PageHeader title="Lớp học của tôi" subtitle="Các lớp được nhà trường phân công chủ nhiệm hoặc giảng dạy bộ môn" breadcrumbs={[{ label: "Việc hôm nay", href: `/teacher/${schoolId}` }, { label: "Lớp học của tôi" }]}
        quote={["Mỗi lớp học là một hành trình", "cùng học sinh lớn lên"]} illustration="/assets/illustrations/teachers-trio.png" />
      <Card className="card-pad flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1 text-[13.5px] text-body">Chỉ hiển thị lớp có phân công còn hiệu lực. Quyền trong mỗi lớp theo đúng nhiệm vụ (chủ nhiệm hoặc môn được giao) và thời gian hiệu lực.</div>
        <div className="w-full sm:w-auto sm:min-w-[300px]"><Toggle checked={ended} onChange={setEnded} label="Hiện cả phân công đã kết thúc" description="Lớp năm cũ / phân công đã thu hồi — chỉ để tra cứu" /></div>
      </Card>
      <QueryState query={q} skeleton="cards">
        {(list) => list.length === 0 ? (
          <Card><EmptyState title="Chưa có lớp được phân công" description="Khi nhà trường phân công, lớp sẽ hiện ở đây. Giáo viên không tự thêm lớp." /></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((c) => {
              const base = `/classroom/${schoolId}/${c.yearId}/${c.id}`;
              const a = acts.data?.[c.id] ?? [];
              const isHr = c.duties.some((d) => d.kind === "homeroom" && d.live);
              return (
                <Card key={c.id} as="article" className={c.live ? "flex flex-col" : "flex flex-col opacity-90"}>
                  <div className="flex items-center gap-3 border-b border-line p-4">
                    <span className="flex size-14 flex-none items-end justify-center overflow-hidden rounded-2xl bg-[#eaf3ff]" aria-hidden><img src="/assets/illustrations/students-trio.png" alt="" className="h-[90%] w-auto" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-[22px] font-extrabold leading-tight text-ink">Lớp {c.name}</h2>{c.live ? <Badge tone="success">Đang phụ trách</Badge> : <Badge tone="neutral">Đã kết thúc</Badge>}</div>
                      <p className="text-[13px] text-muted">Năm học {c.yearLabel} · {classStatus[c.status as keyof typeof classStatus]?.label ?? c.status}</p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 p-4 text-[13.5px]">
                    <div className="flex flex-wrap gap-1.5">
                      {c.duties.map((d) => <Badge key={d.id} tone={d.live ? "info" : "neutral"} dot={false} title={`Hiệu lực ${fmtDate(d.validFrom)}${d.validTo ? ` – ${fmtDate(d.validTo)}` : ""}`}>{d.label}{d.live ? "" : " (đã kết thúc)"}</Badge>)}
                    </div>
                    <p className="flex items-center gap-2 text-body"><Users className="size-4 text-muted" aria-hidden />Sĩ số: <b className="text-ink">{c.size} học sinh</b></p>
                    <p className="flex items-center gap-2 text-body"><MapPin className="size-4 text-muted" aria-hidden />Phòng: <b className="text-ink">{c.room}</b> · GVCN: <b className="text-ink">{c.homeroom}</b></p>
                    <p className="flex items-start gap-2 text-body"><CalendarDays className="mt-0.5 size-4 flex-none text-muted" aria-hidden /><span>Tiết gần nhất: {c.nextLesson ? <b className="text-ink">{c.nextLesson.subject} – Tiết {c.nextLesson.period} ({c.nextLesson.start}), {fmtDateLong(c.nextLesson.date)}</b> : <span className="text-muted">Không có tiết của bạn trong 7 ngày tới</span>}</span></p>
                    {c.duties.map((d) => <p key={d.id} className="flex items-center gap-2 text-[12.5px] text-muted"><History className="size-3.5" aria-hidden />{d.label}: từ {fmtDate(d.validFrom)}{d.validTo ? ` đến ${fmtDate(d.validTo)}` : ""}</p>)}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line p-4">
                    {c.live ? (
                      <>
                        <ButtonLink href={base} size="sm" variant="primary">Mở lớp</ButtonLink>
                        {a.includes("roster.view") && <ButtonLink href={`${base}/students`} size="sm" icon={<Users className="size-4" />}>Học sinh</ButtonLink>}
                        {a.includes("attendance.record") && isHr && <ButtonLink href={`${base}/attendance`} size="sm">Điểm danh</ButtonLink>}
                        <ButtonLink href={`${base}/timetable`} size="sm" icon={<BookOpen className="size-4" />}>Lịch lớp</ButtonLink>
                      </>
                    ) : <p className="text-[13px] text-muted">Phân công đã kết thúc — không còn quyền thao tác trong lớp này.</p>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}
