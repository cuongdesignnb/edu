"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Eye, Brush, Send } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { addDays, mondayOf, weekdayOf } from "@/lib/demo/clock";
import { fmtDate, fmtDateLong, fmtDayMonth, weekdayLabel } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Drawer } from "@/components/ui/dialog";
import { ChipToggleGroup, DateField, ErrorSummary, SelectField, TextField } from "@/components/ui/form";
import { useUnsavedChanges } from "@/components/ui/guards";
import { QueryState } from "@/components/ui/states";

type DD = Awaited<ReturnType<typeof classroomRepo.duties>>;
type Duty = DD["days"][number]["duties"][number];

/** CL16 — duty board (C068 / O26) with a parent-view preview limited to one student's own duties. */
export function DutyBoard() {
  const { schoolId, yearId, classId, readOnly } = useClassroom();
  const ctx = useCtx();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const w = sp.get("week");
  const monday = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : undefined;
  const q = useRepo(["class-duties", classId, monday ?? "cur"], (c) => classroomRepo.duties(c, schoolId, yearId, classId, monday));
  const setWeek = (m: string) => router.replace(`${pathname}?week=${m}`, { scroll: false });
  const [edit, setEdit] = useState<{ duty?: Duty; date: string } | null>(null);
  const [del, setDel] = useState<Duty | null>(null);
  const [preview, setPreview] = useState("");
  const remove = useCommand((c, id: string) => classroomRepo.deleteDuty(c, schoolId, classId, id), { success: "Đã xóa lịch trực", onSuccess: () => setDel(null) });
  return (
    <div className="page">
      <ClassHeader title="Lịch trực nhật" subtitle="Phân công trực nhật theo ngày cho tổ hoặc học sinh; phụ huynh chỉ thấy việc của con khi đã công bố" crumbs={[{ label: "Trực nhật" }]} />
      <QueryState query={q} skeleton="cards">
        {(d) => {
          const editable = d.canEdit && !readOnly;
          const pv = d.days.flatMap((x) => x.duties).filter((x) => x.status === "published" && x.studentIds.includes(preview));
          return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="min-w-0">
                <CardHeader title={`Tuần ${fmtDate(d.monday)} – ${fmtDate(addDays(d.monday, 5))}`} icon={<Brush className="size-5 text-primary" />}
                  action={<>
                    <Button size="sm" variant="secondary" icon={<ChevronLeft className="size-4" />} onClick={() => setWeek(addDays(d.monday, -7))}>Tuần trước</Button>
                    <Button size="sm" variant="secondary" disabled={d.monday === mondayOf(ctx.today)} onClick={() => setWeek(mondayOf(ctx.today))}>Tuần này</Button>
                    <Button size="sm" variant="secondary" iconRight={<ChevronRight className="size-4" />} onClick={() => setWeek(addDays(d.monday, 7))}>Tuần sau</Button>
                    {editable && <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ date: d.days.find((x) => x.date >= ctx.today)?.date ?? ctx.today })}>Phân công</Button>}
                  </>} />
                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                  {d.days.map((x) => {
                    const future = x.date >= ctx.today;
                    return (
                      <section key={x.date} className={clsx("rounded-xl border p-3", x.date === ctx.today ? "border-primary bg-[#f7fbff]" : "border-line bg-white")} aria-label={fmtDateLong(x.date)}>
                        <header className="mb-2 flex items-center justify-between"><b className="text-ink">{weekdayLabel(weekdayOf(x.date))} <span className="font-normal text-muted">{fmtDayMonth(x.date)}</span></b>{x.date === ctx.today && <Badge tone="info" dot={false}>Hôm nay</Badge>}</header>
                        {x.duties.length === 0 ? <p className="text-[13px] text-muted">Chưa phân công.</p> : (
                          <ul className="space-y-2">
                            {x.duties.map((u) => (
                              <li key={u.id} className="rounded-lg border border-line bg-white p-2.5 text-[13px]">
                                <p className="font-semibold text-ink">{u.task}</p>
                                <p className="mt-0.5 flex flex-wrap gap-1">{u.groupName && <Badge tone="purple" dot={false}>{u.groupName}</Badge>}<Badge tone={PUBLICATION_STATUS[u.status].tone}>{u.status === "draft" ? "Nháp — phụ huynh chưa thấy" : "Đã công bố"}</Badge></p>
                                <p className="mt-1 text-muted">{u.studentNames.join(", ")}</p>
                                {editable && future && <div className="mt-1.5 flex gap-1.5"><Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEdit({ duty: u, date: u.date })}>Sửa</Button><Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setDel(u)}>Xóa</Button></div>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {editable && future && <Button size="sm" variant="secondary" block className="mt-2" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ date: x.date })}>Thêm</Button>}
                      </section>
                    );
                  })}
                </div>
                {!editable && <p className="px-5 pb-4 text-[12.5px] text-muted">Chỉ xem. Phân công trực nhật do giáo viên chủ nhiệm thực hiện.</p>}
              </Card>
              <Card className="h-fit">
                <CardHeader title="Phụ huynh thấy gì" icon={<Eye className="size-5 text-primary" />} subtitle="Xem trước phần trực nhật trên trang tra cứu của một học sinh" />
                <div className="space-y-3 px-5 pb-5">
                  <SelectField label="Chọn học sinh" value={preview} onChange={(e) => setPreview(e.target.value)} placeholder="Chọn học sinh…" options={d.students.map((s) => ({ value: s.id, label: s.fullName }))} />
                  {preview && (
                    <div className="rounded-xl border border-[#cfe3fb] bg-[#f7fbff] p-3">
                      <p className="mb-2 text-[13px] font-semibold text-primary-strong">Lịch trực của {d.students.find((s) => s.id === preview)?.fullName} tuần này</p>
                      {pv.length === 0 ? <p className="text-[13px] text-muted">Không có lịch trực đã công bố.</p> : (
                        <ul className="space-y-1.5 text-[13px]">{pv.map((u) => <li key={u.id}><b className="text-ink">{weekdayLabel(weekdayOf(u.date))} {fmtDayMonth(u.date)}</b>: {u.task}{u.studentIds.length > 1 ? ` (cùng ${u.studentIds.length - 1} bạn)` : ""}</li>)}</ul>
                      )}
                      <p className="mt-2 text-[11.5px] text-muted">Không hiển thị tên các bạn khác và bản nháp.</p>
                    </div>
                  )}
                </div>
              </Card>
              {editable && <DutyDrawer target={edit} onClose={() => setEdit(null)} d={d} />}
              <ConfirmDialog open={!!del} onOpenChange={(o) => { if (!o) setDel(null); }} title="Xóa lịch trực" busy={remove.pending}
                object={del ? `${fmtDateLong(del.date)} · ${del.task}` : undefined} consequence={del?.status === "published" ? "Lịch đã công bố — phụ huynh sẽ không còn thấy việc này." : "Bản nháp sẽ bị xóa."}
                confirmLabel="Xóa" variant="danger" onConfirm={async () => { if (del) await remove.run(del.id); }} />
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}

/** O26 — assign a duty in THIS class only; group fills its members; draft or publish. */
function DutyDrawer({ target, onClose, d }: { target: { duty?: Duty; date: string } | null; onClose: () => void; d: DD }) {
  const { schoolId, classId } = useClassroom();
  const ctx = useCtx();
  const [date, setDate] = useState<string | undefined>();
  const [task, setTask] = useState("");
  const [groupId, setGroupId] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [err, setErr] = useState<Record<string, string>>({});
  const init = useMemo(() => target ? { date: target.date, task: target.duty?.task ?? "", groupId: target.duty?.groupId ?? "", ids: target.duty?.studentIds ?? [] } : null, [target]);
  useEffect(() => { if (init) { setDate(init.date); setTask(init.task); setGroupId(init.groupId); setIds(init.ids); setErr({}); } }, [init]);
  const dirty = !!init && (date !== init.date || task !== init.task || groupId !== init.groupId || ids.join() !== init.ids.join());
  useUnsavedChanges(dirty);
  const save = useCommand((c, publish: boolean) => classroomRepo.saveDuty(c, schoolId, classId, { id: target?.duty?.id, date: date!, task, groupId: groupId || undefined, studentIds: ids, publish }), {
    success: (r) => r.status === "published" ? "Đã công bố lịch trực" : "Đã lưu nháp lịch trực", onSuccess: onClose, onError: (e) => setErr(e.fieldErrors ?? { form: e.message }),
  });
  const submit = (publish: boolean) => {
    const e: Record<string, string> = {};
    if (!date) e.date = "Chọn ngày";
    if (task.trim().length < 3) e.task = "Mô tả nhiệm vụ";
    if (!ids.length) e.studentIds = "Chọn ít nhất một học sinh hoặc một tổ";
    setErr(e);
    if (!Object.keys(e).length) void save.run(publish);
  };
  return (
    <Drawer open={!!target} onOpenChange={(o) => { if (!o) onClose(); }} title={target?.duty ? "Sửa lịch trực" : "Phân công trực nhật"} description="Chỉ học sinh của lớp hiện tại" width={520} busy={save.pending}
      footer={<><Button variant="ghost" onClick={onClose} disabled={save.pending}>Hủy</Button><Button variant="secondary" loading={save.pending} onClick={() => submit(false)}>Lưu nháp</Button><Button variant="primary" icon={<Send className="size-4" />} loading={save.pending} onClick={() => submit(true)}>Công bố</Button></>}>
      {target && (
        <div className="space-y-4">
          <ErrorSummary errors={err} labels={{ date: "Ngày", task: "Nhiệm vụ", studentIds: "Học sinh", form: "Lỗi" }} />
          <div data-field="date"><DateField label="Ngày trực" required value={date} onChange={setDate} min={ctx.today} error={err.date} /></div>
          <div data-field="task"><TextField label="Nhiệm vụ" required value={task} onChange={(e) => setTask(e.target.value)} error={err.task} maxLength={120} placeholder="Ví dụ: Lau bảng, quét lớp đầu giờ" /></div>
          <SelectField label="Tổ trực (tuỳ chọn)" value={groupId} onChange={(e) => { const g = e.target.value; setGroupId(g); const grp = d.groups.find((x) => x.id === g); if (grp) setIds(grp.members.map((m) => m.id)); }} placeholder="Không theo tổ" options={d.groups.map((g) => ({ value: g.id, label: `${g.name} (${g.members.length} học sinh)` }))} helper="Chọn tổ sẽ điền sẵn thành viên; có thể bỏ bớt." />
          <div data-field="studentIds"><ChipToggleGroup label={`Học sinh (${ids.length} đã chọn)`} value={ids} onChange={setIds} error={err.studentIds} options={(groupId ? d.groups.find((g) => g.id === groupId)?.members ?? d.students : d.students).map((s) => ({ value: s.id, label: s.fullName }))} /></div>
          <Callout tone="neutral">Bản nháp chỉ nhân sự thấy. Sau khi công bố, phụ huynh chỉ thấy việc của con mình, không thấy tên bạn khác.</Callout>
        </div>
      )}
    </Drawer>
  );
}
