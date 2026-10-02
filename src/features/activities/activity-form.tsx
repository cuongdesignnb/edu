"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Save, Send } from "lucide-react";
import { clsx } from "clsx";
import type { Activity } from "@/lib/model/types";
import { activitiesRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateField, ErrorSummary, RadioGroup, SelectField, TextArea, TextField, Toggle } from "@/components/ui/form";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { DeniedState, QueryState } from "@/components/ui/states";
import { ActivityArt, ILLUSTRATION_OPTIONS } from "./shared";

type Options = Awaited<ReturnType<typeof activitiesRepo.formOptions>>;
type Detail = Awaited<ReturnType<typeof activitiesRepo.detail>>;
type Mode = "class" | "group" | "students";

const LABELS = { title: "Tên hoạt động", description: "Mô tả", dueDate: "Hạn hoàn thành", assignedStudentIds: "Học sinh được giao", group: "Tổ", form: "Biểu mẫu" };

/** CL18 — create / edit an activity. Edit mode is loaded from the detail when activityId is given. */
export function ActivityFormPage({ activityId }: { activityId?: string }) {
  const { schoolId, yearId, classId, base, can, readOnly } = useClassroom();
  const opts = useRepo(["activity-form-options", classId], (ctx) => activitiesRepo.formOptions(ctx, schoolId, yearId, classId));
  const detail = useRepo(["activity", classId, activityId ?? "new"], (ctx) => (activityId ? activitiesRepo.detail(ctx, schoolId, yearId, classId, activityId) : Promise.resolve(null)));
  const title = activityId ? "Sửa hoạt động" : "Tạo hoạt động";
  const crumbs = [{ label: "Hoạt động", href: `${base}/activities` }, ...(activityId && detail.data ? [{ label: detail.data.activity.title, href: `${base}/activities/${activityId}` }] : []), { label: title }];
  return (
    <div className="page">
      <ClassHeader variant="compact" title={title} subtitle="Giao hoạt động cho cả lớp, một tổ hoặc từng học sinh; gia đình của học sinh được giao xem qua link tra cứu." crumbs={crumbs} />
      {!can("activity.manage") || readOnly ? <div className="card"><DeniedState message={readOnly ? "Năm học đã lưu trữ — không tạo hoặc sửa hoạt động." : "Bạn không có quyền tạo hoặc sửa hoạt động của lớp này."} /></div> : (
        <QueryState query={opts} skeleton="form">
          {(o) => (
            <QueryState query={detail} skeleton="form">
              {(d) => d && d.activity.status === "closed" ? <div className="card"><DeniedState message="Hoạt động đã kết thúc — mở lại hoạt động trước khi sửa." /></div> : <ActivityForm key={d?.activity.version ?? "new"} options={o} detail={d} />}
            </QueryState>
          )}
        </QueryState>
      )}
    </div>
  );
}

function initial(d: Detail | null, o: Options) {
  const a = d?.activity;
  const mode: Mode = !a ? "class" : a.assignedGroupId ? "group" : a.assignedStudentIds.length >= o.students.length ? "class" : "students";
  return {
    title: a?.title ?? "", description: a?.description ?? "", illustration: (a?.illustration ?? "trophy") as Activity["illustration"], dueDate: a?.dueDate as string | undefined,
    mode, groupId: a?.assignedGroupId ?? "", studentIds: mode === "students" ? a?.assignedStudentIds ?? [] : [], evidenceRequired: a?.evidenceRequired ?? true,
  };
}

function ActivityForm({ options: o, detail: d }: { options: Options; detail: Detail | null }) {
  const { schoolId, yearId, classId, base } = useClassroom();
  const router = useRouter();
  const start = useMemo(() => initial(d, o), [d, o]);
  const [f, setF] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };
  const dirty = !saved && JSON.stringify(f) !== JSON.stringify(start);
  const isDraft = !d || d.activity.status === "draft";
  const lockedIds = useMemo(() => new Set((d?.students ?? []).filter((s) => s.status !== "not_received").map((s) => s.id)), [d]);

  const assigned = useMemo(() => {
    if (f.mode === "class") return o.students.map((s) => s.id);
    if (f.mode === "group") return o.students.filter((s) => s.groupId === f.groupId).map((s) => s.id);
    return f.studentIds;
  }, [f.mode, f.groupId, f.studentIds, o.students]);

  const cmd = useCommand((ctx, input: Parameters<typeof activitiesRepo.save>[4]) => activitiesRepo.save(ctx, schoolId, yearId, classId, input), {
    success: (a) => (a.status === "draft" ? "Đã lưu nháp hoạt động" : d ? "Đã cập nhật hoạt động" : "Đã giao hoạt động"),
    onError: (e) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? { form: e.message }); },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 5) e.title = "Tên hoạt động tối thiểu 5 ký tự";
    if (f.title.length > 120) e.title = "Tên hoạt động tối đa 120 ký tự";
    if (f.description.trim().length < 10) e.description = "Mô tả tối thiểu 10 ký tự";
    if (f.description.length > 1000) e.description = "Mô tả tối đa 1000 ký tự";
    if (!f.dueDate) e.dueDate = "Chọn hạn hoàn thành";
    else if (f.dueDate < o.today) e.dueDate = "Hạn hoàn thành từ hôm nay trở đi";
    if (f.mode === "group" && !f.groupId) e.group = "Chọn tổ được giao";
    if (!assigned.length) e.assignedStudentIds = "Chọn ít nhất một học sinh hoặc một tổ";
    const dropped = [...lockedIds].filter((id) => !assigned.includes(id));
    if (dropped.length) e.assignedStudentIds = `Không bỏ ${dropped.length} học sinh đã có minh chứng khỏi hoạt động`;
    setErrors(e);
    return !Object.values(e).some(Boolean);
  };

  const submit = useCallback(async (publish: boolean) => {
    if (!validate()) return false;
    const r = await cmd.run({
      id: d?.activity.id, title: f.title, description: f.description, illustration: f.illustration, dueDate: f.dueDate!, assignedStudentIds: assigned,
      assignedGroupId: f.mode === "group" ? f.groupId : undefined, evidenceRequired: f.evidenceRequired, publish, version: d?.activity.version,dataVersion:d?.activity.dataVersion,publicationId:d?.activity.publicationId,
    });
    if (r) { setSaved(true); router.push(`${base}/activities/${r.id}`); return true; }
    return false;
  }, [f, assigned, d, cmd, router, base]); // eslint-disable-line react-hooks/exhaustive-deps

  useUnsavedChanges(dirty, useCallback(() => submit(false), [submit]));

  const groupOptions = o.groups.map((g) => ({ value: g.id, label: `${g.name} (${g.size} học sinh)` }));
  const studentOptions = o.students.map((s) => ({ value: s.id, label: s.fullName, hint: o.groups.find((g) => g.id === s.groupId)?.name }));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Thông tin hoạt động" />
        <form className="space-y-4 px-5 pb-5" onSubmit={(e) => { e.preventDefault(); submit(!isDraft ? false : true); }} noValidate>
          <ErrorSummary errors={errors} labels={LABELS} />
          <div data-field="title"><TextField label="Tên hoạt động" required value={f.title} onChange={(e) => set("title", e.target.value)} error={errors.title || undefined} maxLength={140} placeholder="Ví dụ: Phong trào “Lớp học tích cực”" /></div>
          <div data-field="description"><TextArea label="Mô tả" required rows={4} maxChars={1000} value={f.description} onChange={(e) => set("description", e.target.value)} error={errors.description || undefined} helper="Nêu rõ yêu cầu và cách giáo viên ghi nhận minh chứng." /></div>
          <fieldset className="field">
            <legend className="label mb-1.5">Hình minh họa</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup">
              {ILLUSTRATION_OPTIONS.map((opt) => (
                <label key={opt.value} className={clsx("flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2 text-center text-[12.5px] transition-colors", f.illustration === opt.value ? "border-primary bg-primary-light font-semibold text-primary-strong" : "border-line hover:bg-[#f8fbff]")}>
                  <input type="radio" name="illustration" className="sr-only" checked={f.illustration === opt.value} onChange={() => set("illustration", opt.value)} />
                  <ActivityArt kind={opt.value} className="h-14 w-full" />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div data-field="dueDate" className="max-w-xs"><DateField label="Hạn hoàn thành" required value={f.dueDate} min={o.today} onChange={(v) => set("dueDate", v)} error={errors.dueDate || undefined} /></div>
          <div data-field="assignedStudentIds" className="space-y-3">
            <RadioGroup<Mode> label="Giao cho" value={f.mode} onChange={(v) => set("mode", v)} direction="row"
              options={[{ value: "class", label: "Cả lớp", description: `${o.students.length} học sinh` }, { value: "group", label: "Theo tổ" }, { value: "students", label: "Chọn học sinh" }]} />
            {f.mode === "group" && <div data-field="group"><SelectField label="Tổ" required value={f.groupId} placeholder="Chọn tổ" options={groupOptions} onChange={(e) => set("groupId", e.target.value)} error={errors.group || undefined} /></div>}
            {f.mode === "students" && (
              <Combobox label="Học sinh được giao" required multiple value={f.studentIds} onChange={(v) => set("studentIds", v as string[])} options={studentOptions} placeholder="Tìm và chọn học sinh…" helper="Chỉ học sinh đang học lớp này." />
            )}
            {errors.assignedStudentIds && <p className="error-text" role="alert">{errors.assignedStudentIds}</p>}
            <p className="text-[13px] text-body">Mẫu số tiến độ: <span className="font-semibold text-ink">{assigned.length} học sinh được giao</span>{lockedIds.size > 0 && ` · ${lockedIds.size} em đã có minh chứng (không thể bỏ)`}</p>
          </div>
          <Toggle checked={f.evidenceRequired} onChange={(v) => set("evidenceRequired", v)} label="Yêu cầu minh chứng" description="Giáo viên ghi nhận minh chứng (ảnh/PDF) cho từng học sinh; phụ huynh không tải tệp lên." />
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => router.push(d ? `${base}/activities/${d.activity.id}` : `${base}/activities`)} disabled={cmd.pending}>Hủy</Button>
            {isDraft && <Button variant="secondary" icon={<Save className="size-4" />} loading={cmd.pending} onClick={() => submit(false)}>Lưu nháp</Button>}
            <Button type="submit" variant="primary" icon={isDraft ? <Send className="size-4" /> : <Save className="size-4" />} loading={cmd.pending}>{isDraft ? "Giao hoạt động" : "Lưu thay đổi"}</Button>
          </div>
        </form>
      </Card>
      <div className="space-y-4">
        <Callout tone="warning" icon={<Info />} title="Hoàn thành hoạt động không tự cộng điểm thi đua">Nếu muốn ghi nhận thi đua, giáo viên tạo ghi nhận riêng trong mục Thi đua theo quy chế của trường.</Callout>
        <Callout tone="info" icon={<Info />} title="Lưu nháp và Giao hoạt động khác nhau">
          <ul className="list-disc space-y-1 pl-4">
            <li><b>Lưu nháp</b>: chỉ giáo viên của lớp thấy, gia đình chưa thấy.</li>
            <li><b>Giao hoạt động</b>: bắt đầu theo dõi học sinh được giao. <b>Công bố</b> tại chi tiết hoạt động để gia đình thấy bản đã công bố qua link tra cứu.</li>
            <li>Tiến độ tính trên số học sinh được giao, không tính cả lớp nếu chỉ giao một phần.</li>
          </ul>
        </Callout>
        {d && <p className="text-[12.5px] text-muted">Phiên bản {d.activity.version} · tạo bởi {d.createdByName}</p>}
      </div>
      <ConflictDialog error={cmd.error?.code === "CONFLICT" ? cmd.error : null} onReload={() => { cmd.reset(); window.location.reload(); }} onClose={() => cmd.reset()} />
    </div>
  );
}
