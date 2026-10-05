"use client";
import Link from "next/link";
import {NotebookQuickStatus} from "@/features/notebook/quick-status";
import {Archive,CalendarCheck,CalendarDays,ClipboardCheck,LayoutGrid,Star,ArrowRight,CheckCircle2} from "lucide-react";
import {classroomRepo} from "@/lib/repositories";
import {CLASS_OVERVIEW_TASKS} from "@/lib/repositories/connected/classroom-overview";
import {useRepo} from "@/lib/query/hooks";
import {fmtDateLong,fmtDate} from "@/lib/formatters";
import {useClassroom,ClassHeader} from "@/features/classroom/context";
import {Card,CardHeader,CardLink} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {ButtonLink} from "@/components/ui/button";
import {DonutProgress,ProgressBar} from "@/components/ui/progress";
import {EmptyState,QueryState} from "@/components/ui/states";

const TONE_CLS={danger:"bg-danger-bg text-danger-text",warning:"bg-warning-bg text-warning-text",info:"bg-primary-light text-primary-strong",neutral:"bg-neutral-bg text-neutral-text"};
const HISTORY_LINKS={reports:"Báo cáo lớp","attendance/weekly":"Điểm danh theo tuần",conduct:"Điểm nề nếp các tuần",timetable:"Thời khóa biểu",groups:"Tổ & chức vụ",activities:"Hoạt động lớp"};
const restricted=<p className="px-5 pb-5 text-sm text-muted">Không có quyền xem phần này.</p>;

/** CL01: bounded native sources with explicit denied and absent panels. */
export default function ClassOverview(){
 const {schoolId,yearId,classId,base}=useClassroom();
 const q=useRepo(["class-overview",schoolId,yearId,classId],ctx=>classroomRepo.overview(ctx,schoolId,yearId,classId),{schoolId});
 return <div className="page"><ClassHeader variant="full"/><NotebookQuickStatus/><QueryState query={q} skeleton="none">{d=>{
  const a=d.attendance,c=a?.counts;
  const attendanceLabel=a?.session?.status==='PUBLISHED'?"Đã công bố":a?.session?.status==='LOCKED'?"Đã chốt":a?.session?"Đang ghi nhận":a?.calendarState==='HOLIDAY'?"Ngày nghỉ theo lịch trường":"Chưa tạo buổi điểm danh";
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
   <div className="min-w-0 space-y-5">
    {!d.isCurrent?<Card><CardHeader title={d.readOnly?"Năm học hoặc lớp đã lưu trữ":"Không trong thời gian học hiện tại"} icon={<Archive className="size-5"/>} subtitle="Không hiển thị việc cần làm, lịch học hay điểm danh của ngày hiện tại cho phạm vi này."/><div className="flex flex-wrap gap-2 px-5 pb-5">{d.navigation.map(path=><ButtonLink key={path} href={`${base}/${path}`} size="sm" variant="secondary">{HISTORY_LINKS[path]}</ButtonLink>)}</div></Card>:<>
     <Card data-testid="class-overview-tasks"><CardHeader title="Việc cần làm của lớp" icon={<ClipboardCheck className="size-5"/>} subtitle={fmtDateLong(d.today)}/>
      {d.tasks===null?restricted:d.tasks.length===0?<EmptyState compact icon={<CheckCircle2 className="size-6"/>} title="Không có việc chờ xử lý trong phạm vi được cấp" description="Các nguồn có quyền xử lý sẽ hiện ở đây khi phát sinh công việc."/>:<ul className="divide-y divide-line px-5 pb-3">{d.tasks.map(t=>{const meta=CLASS_OVERVIEW_TASKS[t.kind];return <li key={t.kind} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-[1_1_220px]"><p className="font-semibold text-ink">{meta.label}</p><p className="text-[13px] text-muted">{t.count} {meta.unit}</p></div><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONE_CLS[meta.tone]}`}>{meta.status}</span><ButtonLink href={`${base}${meta.path}`} size="sm" variant="secondary">Mở</ButtonLink></li>;})}</ul>}
     </Card>
     <Card data-testid="class-overview-lessons"><CardHeader title="Lịch học hôm nay" icon={<CalendarDays className="size-5"/>} action={d.navigation.includes('timetable')?<CardLink href={`${base}/timetable`}>Xem thời khóa biểu</CardLink>:undefined}/>
      {d.lessons===null?restricted:d.lessons.length===0?<EmptyState compact title="Không có tiết học đã công bố trong phạm vi được cấp hôm nay"/>:<div className="table-wrap px-5 pb-4"><table className="table" style={{minWidth:520}}><thead><tr><th>Tiết</th><th>Thời gian</th><th>Môn học</th><th>Giáo viên</th><th>Phòng</th></tr></thead><tbody>{d.lessons.map(l=><tr key={l.id}><td>{l.periodNumber??"Chưa ghi số tiết"}</td><td className="tabular-nums">{l.startsAtLocal} – {l.endsAtLocal}</td><td className="font-semibold text-ink">{l.subjectName}{l.status==='CANCELLED'?<Badge tone="neutral" className="ml-2">Đã hủy</Badge>:l.changeReason?<Badge tone="warning" className="ml-2">Thay đổi</Badge>:null}{l.changeReason&&<p className="mt-1 text-xs font-normal text-muted">{l.changeReason}</p>}</td><td>{l.teacherName??"Chưa có tên công tác"}</td><td>{l.roomName??"Chưa ghi phòng"}</td></tr>)}</tbody></table></div>}
     </Card>
    </>}
   </div>
   <div className="min-w-0 space-y-5">
    {d.isCurrent&&<Card data-testid="class-overview-attendance"><CardHeader title="Điểm danh buổi sáng" icon={<CalendarCheck className="size-5"/>} action={d.canRecordMorning?<CardLink href={`${base}/attendance`}>Mở điểm danh</CardLink>:undefined}/>
     {a===null?restricted:c===null||c===undefined?<div className="px-5 pb-5"><Badge tone="neutral">{attendanceLabel}</Badge><p className="mt-2 text-sm text-muted">Chưa có buổi điểm danh sáng cho ngày nghỉ này.</p></div>:<div className="flex flex-wrap items-center gap-5 px-5 pb-5"><DonutProgress value={c.present+c.late} total={c.total} label={`Hiện diện ${c.present+c.late}/${c.total}`} color="var(--color-success)"><span className="text-2xl font-extrabold text-ink">{c.present+c.late}/{c.total}</span><span className="text-[11px] text-muted">hiện diện</span></DonutProgress><ul className="min-w-[180px] flex-1 space-y-1.5 text-[13.5px]">{[["Có mặt đúng giờ",c.present,"bg-success"],["Đi muộn",c.late,"bg-warning"],["Nghỉ có phép",c.excused,"bg-primary"],["Nghỉ không phép",c.unexcused,"bg-danger"],["Chưa điểm danh",c.unmarked,"bg-faint"]].map(([label,value,color])=><li key={label as string} className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${color}`} aria-hidden/><span className="text-body">{label}</span><span className="ml-auto font-semibold tabular-nums text-ink">{value}</span></li>)}<li className="pt-1"><Badge tone={a.session?.status==='PUBLISHED'?'success':'neutral'} className="!whitespace-normal">{attendanceLabel}</Badge>{a.calendarState==='HOLIDAY'&&a.session&&<p className="mt-2 text-xs text-muted">Ngày đã được đánh dấu nghỉ; hiển thị buổi đã tồn tại.</p>}</li></ul></div>}
    </Card>}
    <Card data-testid="class-overview-groups"><CardHeader title="Tổ và sơ đồ" icon={<LayoutGrid className="size-5"/>} action={d.navigation.includes('groups')?<CardLink href={`${base}/groups`}>Xem tổ & chức vụ</CardLink>:undefined}/>{d.groups===null?restricted:<div className="grid grid-cols-2 gap-3 px-5 pb-5">{d.groups.items.map(g=><div key={g.id} className="rounded-xl border border-line bg-[#f7fbff] p-3"><p className="font-bold text-primary-strong">{g.name}</p><p className="text-[13px] text-muted">{g.size} học sinh</p></div>)}{d.groups.items.length===0&&<p className="col-span-2 text-sm text-muted">Chưa tạo tổ cho lớp.</p>}{d.groups.noGroup>0&&<p className="col-span-2 text-[13px] text-warning-text">{d.groups.noGroup} học sinh chưa phân tổ</p>}</div>}</Card>
    <Card data-testid="class-overview-activities"><CardHeader title={d.isCurrent?"Hoạt động đang diễn ra":"Hoạt động trong năm học"} icon={<Star className="size-5"/>} action={d.navigation.includes('activities')?<CardLink href={`${base}/activities`}/>:undefined}/>{d.activities===null?restricted:<ul className="space-y-4 px-5 pb-5">{d.activities.items.length===0&&<li className="text-sm text-muted">Chưa có hoạt động đang giao trong phạm vi được cấp.</li>}{d.activities.items.map(activity=><li key={activity.id}><Link href={`${base}/activities/${activity.id}`} className="group block"><ProgressBar value={activity.done} total={activity.total} ariaLabel={`Tiến độ ${activity.title}`} label={<span className="group-hover:underline">{activity.title}</span>} color="var(--color-purple)"/><p className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[12px] text-muted"><span>{activity.done}/{activity.total} học sinh được giao đã duyệt</span><span>Hạn {fmtDate(activity.dueDate)}</span></p></Link></li>)}{d.activities.hasMore&&<li className="text-sm text-muted">Hiển thị {d.activities.items.length}/{d.activities.total} hoạt động. <Link className="card-link" href={`${base}/activities`}>Xem tất cả</Link></li>}</ul>}{d.navigation.includes('reports')&&<div className="px-5 pb-4"><Link href={`${base}/reports`} className="card-link">Báo cáo lớp <ArrowRight className="size-3.5"/></Link></div>}</Card>
   </div>
  </div>;
 }}</QueryState></div>;
}
