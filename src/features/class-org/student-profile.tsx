"use client";
import Link from "next/link";
import { useState } from "react";
import { UserRound, ShieldCheck, Link2, History, CalendarCheck, Lock, ArrowLeftRight, ExternalLink, Users2, StickyNote } from "lucide-react";
import { sessionRepo, studentsRepo } from "@/lib/repositories";
import { teacherExtraRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { attendanceStatus, fmtDate, fmtDateTime, positionLabel, studentStatus, verificationStatus } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { QueryState, Skeleton } from "@/components/ui/states";
import { TransferDialog } from "./dialogs";

/** CL03 — the shared student profile, projected for the actor's class scope (subject teachers get a minimal view). */
export function ClassStudentProfile({ studentId }: { studentId: string }) {
  const { schoolId, yearId, classId, base, can, readOnly } = useClassroom();
  const q = useRepo(["student-profile", schoolId, studentId, classId], (ctx) => studentsRepo.profile(ctx, schoolId, studentId, classId));
  const att = useRepo(["student-attendance", classId, studentId], (ctx) => teacherExtraRepo.studentAttendance(ctx, schoolId, yearId, classId, studentId), { retry: false });
  const school = useRepo(["school-actions", schoolId], (ctx) => sessionRepo.schoolActions(ctx, schoolId));
  const [transfer, setTransfer] = useState(false);
  return (
    <QueryState query={q} skeleton="detail">
      {(p) => {
        const s = p.student;
        const minimal = p.level === "subject-minimal";
        const inThisClass = p.currentClass?.id === classId;
        const activeLinks = p.links.filter((l) => l.status === "active");
        return (
          <div className="page">
            <ClassHeader title="Hồ sơ học sinh" subtitle={`${s.fullName} · ${s.code} · Lớp ${p.currentClass?.name ?? "—"}`} crumbs={[{ label: "Học sinh", href: `${base}/students` }, { label: s.fullName }]}
              actions={!readOnly && inThisClass && can("groups.manage") && p.perms.transfer ? <Button size="sm" icon={<ArrowLeftRight className="size-4" />} onClick={() => setTransfer(true)}>Đề nghị chuyển lớp</Button> : undefined} />
            {minimal && <Callout tone="neutral" icon={<Lock />} title="Hồ sơ rút gọn theo phạm vi giáo viên bộ môn">Không hiển thị người giám hộ, link tra cứu, ngày sinh và ghi chú nội bộ. Dùng chung một hồ sơ nhưng chỉ trả về trường thông tin bạn được phép xem.</Callout>}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-5">
                <Card>
                  <div className="flex flex-wrap items-center gap-4 p-5">
                    <Avatar name={s.fullName} tone={s.avatarTone} size={72} square />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[22px] font-extrabold text-ink">{s.fullName}</h2>
                      <p className="text-[13.5px] text-muted">Mã {s.code} · {s.gender}{!minimal && s.dob ? ` · Sinh ngày ${fmtDate(s.dob)}` : ""}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone={studentStatus[s.status as keyof typeof studentStatus]?.tone ?? "neutral"}>{studentStatus[s.status as keyof typeof studentStatus]?.label ?? s.status}</Badge>
                        {p.group && <Badge tone="info" dot={false}>{p.group}</Badge>}
                        {p.positions.map((x) => <Badge key={x} tone="warning" dot={false}>{positionLabel[x]}</Badge>)}
                      </div>
                    </div>
                    {school.data?.includes("student.view.all") && <Link href={`/school/${schoolId}/students/${studentId}`} className="card-link">Hồ sơ đầy đủ ở nhà trường <ExternalLink className="size-3.5" aria-hidden /></Link>}
                  </div>
                  <dl className="border-t border-line px-5 py-3">
                    <InfoRow label="Lớp hiện tại">{p.currentClass ? `${p.currentClass.name} · Năm học ${p.currentClass.yearLabel}` : "Không có lớp đang học"}</InfoRow>
                    <InfoRow label="Giáo viên chủ nhiệm">{p.currentClass?.homeroom || "—"}</InfoRow>
                    {!minimal && <InfoRow label="Tổ">{p.group ?? "Chưa phân tổ"}</InfoRow>}
                    <InfoRow label="Chức vụ trong lớp">{p.positions.length ? p.positions.map((x) => positionLabel[x]).join(", ") : "—"}</InfoRow>
                  </dl>
                  {!minimal && p.perms.seeInternalNote && "internalNote" in s && s.internalNote && (
                    <div className="mx-5 mb-5 flex gap-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13.5px] text-warning-text"><StickyNote className="mt-0.5 size-4 flex-none" aria-hidden /><span><b>Ghi chú nội bộ (không chia sẻ phụ huynh):</b> {s.internalNote}</span></div>
                  )}
                </Card>

                <Card>
                  <CardHeader title="Chuyên cần trong lớp" icon={<CalendarCheck className="size-5 text-primary" />} subtitle="Theo các buổi sáng đã lưu" action={can("attendance.record") || can("report.class") ? <Link href={`${base}/attendance/weekly`} className="card-link">Xem theo tuần</Link> : undefined} />
                  <div className="px-5 pb-5">
                    {att.isLoading ? <Skeleton className="h-24" /> : att.error ? <p className="text-sm text-muted">Bạn không có quyền xem tổng hợp chuyên cần của học sinh này.</p> : att.data && (
                      <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          {(["present", "late", "excused", "unexcused", "unmarked"] as const).map((k) => (
                            <div key={k} className="rounded-xl border border-line p-2.5 text-center">
                              <p className="text-[22px] font-extrabold text-ink tabular-nums">{att.data!.tally[k]}</p>
                              <p className="text-[12px] text-muted">{attendanceStatus[k].label}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-[12.5px] text-muted">{att.data.sessions} buổi đã lưu · {att.data.published} buổi đã công bố cho phụ huynh.</p>
                        {att.data.notable.length > 0 && (
                          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                            {att.data.notable.map((n) => (
                              <li key={n.date} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                                <span className="w-[92px] tabular-nums text-body">{fmtDate(n.date)}</span>
                                <Badge tone={attendanceStatus[n.status].tone}>{attendanceStatus[n.status].label}</Badge>
                                <span className="min-w-0 flex-1 truncate text-muted">{n.note ?? ""}</span>
                                <span className="text-[12px] text-muted">{n.published ? "Đã công bố" : "Chưa công bố"}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Lịch sử lớp học" icon={<History className="size-5 text-primary" />} subtitle={minimal ? "Chỉ lớp hiện tại trong phạm vi của bạn" : "Mọi lần chuyển lớp / ngừng học được giữ nguyên"} />
                  <ul className="space-y-2 px-5 pb-5">
                    {p.history.map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3.5 py-2.5 text-[13.5px]">
                        <b className="text-ink">Lớp {h.className}</b><span className="text-muted">· {h.yearLabel}</span>
                        <span className="text-body">từ {fmtDate(h.startDate)}{h.endDate ? ` đến ${fmtDate(h.endDate)}` : ""}</span>
                        {h.endDate ? <Badge tone="neutral">Đã kết thúc{h.endReason ? `: ${h.endReason}` : ""}</Badge> : <Badge tone="success">Đang học</Badge>}
                        {h.homeroom && <span className="ml-auto text-[12px] text-muted">GVCN: {h.homeroom}</span>}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              <div className="min-w-0 space-y-5">
                {p.perms.seeGuardians ? (
                  <Card>
                    <CardHeader title="Người giám hộ" icon={<UserRound className="size-5 text-primary" />} />
                    {p.relationships.length === 0 ? <p className="px-5 pb-5 text-sm text-warning-text">Chưa có người giám hộ.</p> : (
                      <ul className="space-y-2.5 px-5 pb-5">
                        {p.relationships.map((r) => (
                          <li key={r.id} className="rounded-xl border border-line p-3 text-[13.5px]">
                            <p className="flex flex-wrap items-center gap-2"><b className="text-ink">{r.guardian.fullName}</b><span className="text-muted">({r.relation})</span>{r.isPrimaryContact && <Badge tone="info" dot={false}>Liên hệ chính</Badge>}</p>
                            <p className="text-muted">Điện thoại: {r.guardian.phoneMasked}</p>
                            <p className="mt-1"><Badge tone={verificationStatus[r.verification].tone} icon={<ShieldCheck className="size-3" />}>{verificationStatus[r.verification].label}</Badge></p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ) : (
                  <Card className="card-pad"><p className="flex items-center gap-2 text-sm text-muted"><Lock className="size-4" aria-hidden />Thông tin người giám hộ không thuộc phạm vi của bạn.</p></Card>
                )}
                {p.perms.manageLinks && (
                  <Card>
                    <CardHeader title="Link tra cứu phụ huynh" icon={<Link2 className="size-5 text-primary" />} subtitle={`${activeLinks.length} link đang hiệu lực · ${activeLinks.filter((l) => l.opens > 0).length} link đã được mở`} />
                    {p.links.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Chưa cấp link tra cứu.</p> : (
                      <ul className="space-y-2 px-5 pb-4">
                        {p.links.map((l) => (
                          <li key={l.id} className="rounded-xl border border-line p-3 text-[13px]">
                            <p className="flex flex-wrap items-center gap-2"><b className="text-ink">Link cấp cho {l.relation.toLowerCase()}</b><span className="text-muted">({l.guardianName})</span></p>
                            <p className="mt-1 flex flex-wrap gap-1.5"><Badge tone={PUBLICATION_STATUS[l.status]?.tone ?? "neutral"}>{PUBLICATION_STATUS[l.status]?.label ?? l.status}</Badge>{l.status === "active" && <Badge tone={l.opens ? "success" : "neutral"}>{l.opens ? "Link đã được mở" : "Đã cấp link, chưa mở"}</Badge>}</p>
                            <p className="mt-1 text-muted">Hết hạn {fmtDate(l.expiresAt)}{l.lastOpenedAt ? ` · Mở gần nhất ${fmtDateTime(l.lastOpenedAt)}` : ""}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="px-5 pb-4 text-[12px] text-muted">Nhật ký chỉ ghi “link được mở”, không xác định ai cầm link.</p>
                    {school.data?.includes("parentAccess.manage.all") && <div className="px-5 pb-5"><Link href={`/school/${schoolId}/students/${studentId}`} className="card-link">Quản lý quyền tra cứu ở hồ sơ nhà trường <ExternalLink className="size-3.5" aria-hidden /></Link></div>}
                  </Card>
                )}
                {can("groups.manage") && <Card className="card-pad"><Link href={`${base}/groups`} className="card-link"><Users2 className="size-4" aria-hidden />Đổi tổ / chức vụ ở trang Tổ & chức vụ</Link></Card>}
              </div>
            </div>
            {inThisClass && <TransferDialog open={transfer} onOpenChange={setTransfer} schoolId={schoolId} yearId={yearId} classId={classId} preset={studentId} students={[{ id: s.id, fullName: s.fullName, code: s.code }]} />}
          </div>
        );
      }}
    </QueryState>
  );
}
