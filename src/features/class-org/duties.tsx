"use client";
import {ScheduleCopyControls} from "@/features/notebook/schedule-copy";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Eye, Brush, Send } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { addDays, mondayOf, weekdayOf } from "@/lib/calendar";
import { fmtDate, fmtDateLong, fmtDayMonth, weekdayLabel } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { ClassOrgNav } from "./org-nav";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Drawer } from "@/components/ui/dialog";
import { ChipToggleGroup, DateField, ErrorSummary, SelectField, TextField } from "@/components/ui/form";
import { useUnsavedChanges } from "@/components/ui/guards";
import { QueryState } from "@/components/ui/states";

type DD = Awaited<ReturnType<typeof classroomRepo.duties>>;
type Duty = DD["days"][number]["duties"][number];
type EditTarget={duty?:Duty;date:string;publicationId:string|null};

/** CL16 — duty board (C068 / O26) with a parent-view preview limited to one student's own duties. */
export function DutyBoard() {
  const { schoolId, yearId, classId, readOnly } = useClassroom();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const w = sp.get("week");
  const monday = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : undefined;
  const q = useRepo(["class-duties", schoolId, yearId, classId, monday ?? "cur"], (c) => classroomRepo.duties(c, schoolId, yearId, classId, monday));
  const setWeek = (m: string) => router.replace(`${pathname}?week=${m}`, { scroll: false });
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [del, setDel] = useState<{duty:Duty;publicationId:string|null} | null>(null);
  const [preview, setPreview] = useState("");
  const remove = useCommand((c, target:NonNullable<typeof del>) => classroomRepo.deleteDuty(c, schoolId, classId, {yearId,source:target.duty.source,expectedPublicationId:target.publicationId}), { success: "Đã xóa lịch trực", onSuccess: () => setDel(null) });
  return (
    <div className="page">
      <ClassHeader title="Lịch trực nhật" subtitle="Phân công trực nhật theo ngày cho tổ hoặc học sinh; phụ huynh chỉ thấy việc của con khi đã công bố" crumbs={[{ label: "Trực nhật" }]} />
      <ClassOrgNav />
      <ScheduleCopyControls kind="DUTY"/><QueryState query={q} skeleton="cards">
        {(d) => {
          const editable = d.canEdit && !readOnly;
          const pv = d.preview.filter(x=>x.studentId===preview);
          return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="min-w-0">
                <CardHeader title={`Tuần ${fmtDate(d.monday)} – ${fmtDate(addDays(d.monday, 5))}`} icon={<Brush className="size-5 text-primary" />}
                  action={<>
                    <Button size="sm" variant="secondary" disabled={!d.canPrevious} icon={<ChevronLeft className="size-4" />} onClick={() => setWeek(addDays(d.monday, -7))}>Tuần trước</Button>
                    <Button size="sm" variant="secondary" disabled={d.monday === mondayOf(d.today<d.startsOn?d.startsOn:d.today>=d.endsOn?addDays(d.endsOn,-1):d.today)} onClick={() => setWeek(mondayOf(d.today<d.startsOn?d.startsOn:d.today>=d.endsOn?addDays(d.endsOn,-1):d.today))}>Tuần này</Button>
                    <Button size="sm" variant="secondary" disabled={!d.canNext} iconRight={<ChevronRight className="size-4" />} onClick={() => setWeek(addDays(d.monday, 7))}>Tuần sau</Button>
                    {editable && d.days.some(x=>x.date>=d.today) && <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ date: d.days.find((x) => x.date >= d.today)!.date,publicationId:d.publicationId })}>Phân công</Button>}
                  </>} />
                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                  {d.days.map((x) => {
                    const future = x.date >= d.today;
                    return (
                      <section key={x.date} className={clsx("rounded-xl border p-3", x.date === d.today ? "border-primary bg-[#f7fbff]" : "border-line bg-white")} aria-label={fmtDateLong(x.date)}>
                        <header className="mb-2 flex items-center justify-between"><b className="text-ink">{weekdayLabel(weekdayOf(x.date))} <span className="font-normal text-muted">{fmtDayMonth(x.date)}</span></b>{x.date === d.today && <Badge tone="info" dot={false}>Hôm nay</Badge>}</header>
                        {x.duties.length === 0 ? <p className="text-[13px] text-muted">Chưa phân công.</p> : (
                          <ul className="space-y-2">
                            {x.duties.map((u) => (
                              <li key={u.id} className="rounded-lg border border-line bg-white p-2.5 text-[13px]">
                                <p className="font-semibold text-ink">{u.task}</p>
                                <p className="mt-0.5 flex flex-wrap gap-1">{u.groupName && <Badge tone="purple" dot={false}>{u.groupName}</Badge>}<Badge tone={u.status==='withdrawn'?'neutral':PUBLICATION_STATUS[u.status].tone}>{u.status === "draft" ? "Nháp — phụ huynh chưa thấy" : u.status==='withdrawn'?'Đã thu hồi — phụ huynh không thấy':"Đã công bố"}</Badge></p>
                                <p className="mt-1 text-muted">{u.studentNames.join(", ")}</p>
                                {u.unavailableTargets>0&&<p className="mt-1 text-warning">{u.unavailableTargets} học sinh không còn thuộc lớp tại ngày trực; chọn lại khi sửa.</p>}
                                {editable && future && u.canEdit && <div className="mt-1.5 flex gap-1.5"><Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEdit({ duty: u, date: u.date,publicationId:d.publicationId })}>Sửa</Button><Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setDel({duty:u,publicationId:d.publicationId})}>Xóa</Button></div>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {editable && future && <Button size="sm" variant="secondary" block className="mt-2" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ date: x.date,publicationId:d.publicationId })}>Thêm</Button>}
                      </section>
                    );
                  })}
                </div>
                {!editable && <p className="px-5 pb-4 text-[12.5px] text-muted">Chỉ xem. Phân công trực nhật do giáo viên chủ nhiệm thực hiện.</p>}
              </Card>
              <Card className="h-fit">
                <CardHeader title="Phụ huynh thấy gì" icon={<Eye className="size-5 text-primary" />} subtitle="Xem trước phần trực nhật trên trang tra cứu của một học sinh" />
                <div className="space-y-3 px-5 pb-5">
                  {!d.canPreview&&<p className="text-[13px] text-muted">Bạn chưa được cấp quyền xem trước phần của phụ huynh.</p>}
                  {d.canPreview&&<SelectField label="Chọn học sinh" value={preview} onChange={(e) => setPreview(e.target.value)} placeholder="Chọn học sinh…" options={d.previewStudents.map((s) => ({ value: s.id, label: s.fullName }))} />}
                  {d.canPreview&&preview&&d.previewStudents.some(s=>s.id===preview) && (
                    <div className="rounded-xl border border-[#cfe3fb] bg-[#f7fbff] p-3">
                      <p className="mb-2 text-[13px] font-semibold text-primary-strong">Lịch trực của {d.previewStudents.find((s) => s.id === preview)?.fullName} tuần này</p>
                      {pv.length === 0 ? <p className="text-[13px] text-muted">Không có lịch trực đã công bố.</p> : (
                        <ul className="space-y-1.5 text-[13px]">{pv.map((u,i) => <li key={u.date+":"+i}><b className="text-ink">{weekdayLabel(weekdayOf(u.date))} {fmtDayMonth(u.date)}</b>: {u.task}{u.status==='DONE'?' · Đã hoàn thành':u.status==='CANCELLED'?' · Đã hủy':''}</li>)}</ul>
                      )}
                      <p className="mt-2 text-[11.5px] text-muted">Không hiển thị tên các bạn khác và bản nháp.</p>
                    </div>
                  )}
                </div>
              </Card>
              {editable && <DutyDrawer target={edit} onClose={() => setEdit(null)} d={d} />}
              <ConfirmDialog open={!!del} onOpenChange={(o) => { if (!o) setDel(null); }} title="Xóa lịch trực" busy={remove.pending}
                object={del ? `${fmtDateLong(del.duty.date)} · ${del.duty.task}` : undefined} consequence={del?.duty.status === "published" ? "Lịch đã công bố — phụ huynh sẽ không còn thấy việc này." : "Lịch trực này sẽ được bỏ khỏi bảng."}
                confirmLabel="Xóa" variant="danger" onConfirm={async () => { if (del) await remove.run(del); }} />
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}

/** O26 — assign a duty in THIS class only; group fills its members; draft or publish. */
function DutyDrawer({ target, onClose, d }: { target: EditTarget | null; onClose: () => void; d: DD }) {
  const { schoolId, yearId, classId } = useClassroom();
  const [date, setDate] = useState<string | undefined>();
  const [task, setTask] = useState("");
  const [groupId, setGroupId] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [err, setErr] = useState<Record<string, string>>({});
  const init = useMemo(() => target ? { date: target.date, task: target.duty?.task ?? "", groupId: target.duty?.groupId ?? "", ids: target.duty?.studentIds ?? [] } : null, [target]);
  useEffect(() => { if (init) { setDate(init.date); setTask(init.task); setGroupId(init.groupId); setIds(init.ids); setErr({}); } }, [init]);
  const dirty = !!init && (date !== init.date || task !== init.task || groupId !== init.groupId || ids.join() !== init.ids.join());
  useUnsavedChanges(dirty);
  const choices=useRepo(["class-duty-choices",schoolId,yearId,classId,date],c=>classroomRepo.dutyChoices(c,schoolId,yearId,classId,date!),{enabled:!!target&&!!date});
  const canDraft=!!choices.data&&!choices.error&&!choices.isFetching&&choices.data.canEdit&&!!date&&date>=choices.data.today&&(!target?.duty||target.duty.status==='draft'||choices.data.canPublish);
  const canPublish=canDraft&&choices.data!.canPublish;
  const save = useCommand((c, publish: boolean) => classroomRepo.saveDuty(c, schoolId, classId, { yearId,source:target?.duty?.source??null,expectedPublicationId:target!.publicationId, date: date!, task, groupId: groupId || undefined, studentIds: ids, publish }), {
    success: (r) => r.status === "published" ? "Đã công bố lịch trực" : "Đã lưu nháp lịch trực", onSuccess: onClose, onError: (e) => setErr(e.fieldErrors ?? { form: e.message }),
  });
  const submit = (publish: boolean) => {
    const e: Record<string, string> = {};
    if (!date) e.date = "Chọn ngày";
    if (task.trim().length < 3) e.task = "Mô tả nhiệm vụ";
    if (!ids.length) e.studentIds = "Chọn ít nhất một học sinh hoặc một tổ";
    if(choices.data&&ids.some(id=>!choices.data!.students.some(s=>s.id===id)))e.studentIds="Có học sinh không thuộc lớp tại ngày đã chọn; chọn lại học sinh.";
    if(!(publish?canPublish:canDraft))e.form="Chưa tải được danh sách hoặc chưa được cấp quyền cho ngày đã chọn.";
    setErr(e);
    if (!Object.keys(e).length) void save.run(publish);
  };
  return (
    <Drawer open={!!target} onOpenChange={(o) => { if (!o) onClose(); }} title={target?.duty ? "Sửa lịch trực" : "Phân công trực nhật"} description="Chỉ học sinh của lớp hiện tại" width={520} busy={save.pending}
      footer={<><Button variant="ghost" onClick={onClose} disabled={save.pending}>Hủy</Button><Button variant="secondary" disabled={!canDraft} loading={save.pending} onClick={() => submit(false)}>Lưu nháp</Button><Button variant="primary" disabled={!canPublish} icon={<Send className="size-4" />} loading={save.pending} onClick={() => submit(true)}>Công bố</Button></>}>
      {target && (
        <div className="space-y-4">
          <ErrorSummary errors={err} labels={{ date: "Ngày", task: "Nhiệm vụ", studentIds: "Học sinh", form: "Lỗi" }} />
          <div data-field="date"><DateField label="Ngày trực" required value={date} onChange={setDate} min={d.today} max={addDays(d.endsOn,-1)} error={err.date} /></div>
          <div data-field="task"><TextField label="Nhiệm vụ" required value={task} onChange={(e) => setTask(e.target.value)} error={err.task} maxLength={120} placeholder="Ví dụ: Lau bảng, quét lớp đầu giờ" /></div>
          <QueryState query={choices} skeleton="cards">{options=><>
          <SelectField label="Tổ trực (tuỳ chọn)" value={groupId} onChange={(e) => { const g = e.target.value; setGroupId(g); const grp = options.groups.find((x) => x.id === g); if (grp) setIds(grp.members.map((m) => m.id)); }} placeholder="Không theo tổ" options={options.groups.map((g) => ({ value: g.id, label: `${g.name} (${g.members.length} học sinh)` }))} helper="Chọn tổ sẽ điền sẵn thành viên theo ngày trực; có thể bỏ bớt." />
          <div data-field="studentIds"><ChipToggleGroup label={`Học sinh (${ids.length} đã chọn)`} value={ids} onChange={setIds} error={err.studentIds} options={(groupId ? options.groups.find((g) => g.id === groupId)?.members ?? options.students : options.students).map((s) => ({ value: s.id, label: s.fullName }))} /></div>
          {ids.some(id=>!options.students.some(s=>s.id===id))&&<Button variant="secondary" onClick={()=>{setIds([]);setGroupId("");}}>Chọn lại học sinh theo ngày trực</Button>}
          {!options.canPublish&&<p className="text-sm text-muted">Bạn chưa được cấp quyền công bố lịch trực tại ngày này.</p>}
          </>}</QueryState>
          <Callout tone="neutral">Bản nháp chỉ nhân sự thấy. Sau khi công bố, phụ huynh chỉ thấy việc của con mình, không thấy tên bạn khác.</Callout>
        </div>
      )}
    </Drawer>
  );
}
