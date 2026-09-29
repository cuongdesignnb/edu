"use client";
import { useCallback, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  Heading2, List, Pilcrow, Plus, Trash2, ArrowUp, ArrowDown, Eye, PenLine, Save, Send, CalendarClock, Users, Paperclip, Lock, Globe, Info, Smartphone,
} from "lucide-react";
import type { Announcement, AnnouncementScope } from "@/lib/model/types";
import { announcementsRepo, type RepoError } from "@/lib/repositories";
import { schoolOpsRepo } from "@/lib/repositories/school-ops-extra";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { addDays, demoNowISO, demoToday, localDateTime } from "@/lib/demo/clock";
import { fmtDateTime, fmtNumber } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge, DemoTag } from "@/components/ui/badge";
import { Checkbox, DateField, ErrorSummary, Field, RadioGroup, SelectField, TextArea, TextField } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { ConflictDialog, useLeaveGuard, useUnsavedChanges } from "@/components/ui/guards";
import { Skeleton } from "@/components/ui/states";
import { AnnouncementBody, ANNOUNCEMENT_AUDIENCE, type BodyBlock } from "./body";

export type AnnouncementDetail = Awaited<ReturnType<typeof announcementsRepo.detail>>;
type Action = "draft" | "publish" | "schedule";

const BLOCK_LABEL: Record<BodyBlock["type"], string> = { p: "Đoạn văn", h: "Tiêu đề mục", li: "Gạch đầu dòng" };

/* ------------------------------ C021 RichTextEditor (lite, structured blocks) ------------------------------ */
export function RichTextEditor({ value, onChange, error, readOnly }: { value: BodyBlock[]; onChange: (v: BodyBlock[]) => void; error?: string; readOnly?: boolean }) {
  const [focus, setFocus] = useState(0);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const set = (i: number, patch: Partial<BodyBlock>) => onChange(value.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const add = (type: BodyBlock["type"]) => { const at = Math.min(focus + 1, value.length); onChange([...value.slice(0, at), { type, text: "" }, ...value.slice(at)]); setFocus(at); };
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= value.length) return; const n = [...value]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); setFocus(j); };
  const remove = (i: number) => { const n = value.filter((_, j) => j !== i); onChange(n.length ? n : [{ type: "p", text: "" }]); setFocus(Math.max(0, i - 1)); };
  if (readOnly) return <AnnouncementBody body={value} />;
  return (
    <div className={clsx("rounded-xl border bg-white", error ? "border-danger" : "border-line")} data-field="body">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-[#f7fbff] px-2 py-1.5" role="toolbar" aria-label="Định dạng nội dung">
        <span className="px-1 text-[12px] font-semibold text-muted">Khối đang chọn:</span>
        {(["p", "h", "li"] as const).map((t) => (
          <button key={t} type="button" className={clsx("btn btn-ghost btn-sm", value[focus]?.type === t && "!bg-primary-light !text-primary-strong")} aria-pressed={value[focus]?.type === t}
            onClick={() => value[focus] && set(focus, { type: t })} disabled={mode === "preview"}>
            {t === "p" ? <Pilcrow className="size-4" aria-hidden /> : t === "h" ? <Heading2 className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}{BLOCK_LABEL[t]}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => add("p")} disabled={mode === "preview"}><Plus className="size-4" aria-hidden />Thêm khối</button>
        <div className="ml-auto flex gap-1">
          <button type="button" className={clsx("btn btn-ghost btn-sm", mode === "edit" && "!bg-white !shadow-sm")} aria-pressed={mode === "edit"} onClick={() => setMode("edit")}><PenLine className="size-4" aria-hidden />Soạn</button>
          <button type="button" className={clsx("btn btn-ghost btn-sm", mode === "preview" && "!bg-white !shadow-sm")} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}><Eye className="size-4" aria-hidden />Xem trước</button>
        </div>
      </div>
      {mode === "preview" ? <div className="min-h-[160px] px-4 py-3"><AnnouncementBody body={value} /></div> : (
        <ol className="space-y-2 p-3">
          {value.map((b, i) => (
            <li key={i} className={clsx("group flex gap-2 rounded-lg border px-2 py-1.5", focus === i ? "border-[#9cc7f5] bg-[#fbfdff]" : "border-transparent")}>
              <span className="mt-2 flex w-6 flex-none justify-center text-muted" title={BLOCK_LABEL[b.type]} aria-hidden>
                {b.type === "h" ? <Heading2 className="size-4" /> : b.type === "li" ? <span className="mt-1 size-1.5 rounded-full bg-ink" /> : <Pilcrow className="size-4" />}
              </span>
              <textarea aria-label={`${BLOCK_LABEL[b.type]} ${i + 1}`} value={b.text} rows={b.type === "p" ? 3 : 1} onFocus={() => setFocus(i)} onChange={(e) => set(i, { text: e.target.value })}
                placeholder={b.type === "h" ? "Tiêu đề mục" : b.type === "li" ? "Một ý trong danh sách" : "Nội dung đoạn văn"}
                className={clsx("min-w-0 flex-1 resize-y bg-transparent py-1.5 text-[14px] leading-relaxed text-ink outline-none", b.type === "h" && "font-bold")} />
              <div className="flex flex-none flex-col gap-0.5 opacity-70 group-focus-within:opacity-100 sm:flex-row sm:items-start">
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Chuyển khối lên" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Chuyển khối xuống" disabled={i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm text-danger-text" aria-label="Xóa khối" onClick={() => remove(i)}><Trash2 className="size-4" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-line px-3 py-1.5 text-[12px] text-muted">Nội dung có cấu trúc (đoạn văn, tiêu đề, danh sách). Không hỗ trợ chèn mã HTML, script hoặc liên kết ẩn.</p>
    </div>
  );
}

/* ------------------------------ C022 AudienceSelector ------------------------------ */
type ComposeOptions = Awaited<ReturnType<typeof announcementsRepo.composeOptions>>;

export function AudienceSelector({ schoolId, origin, classId, options, scope, onScope, error }: {
  schoolId: string; origin: "school" | "class"; classId?: string; options: ComposeOptions; scope: AnnouncementScope; onScope: (s: AnnouncementScope) => void; error?: string;
}) {
  const [pickClass, setPickClass] = useState<string>(scope.type === "student" ? scope.classIds?.[0] ?? "" : "");
  const studentsQ = useRepo(["ann-class-students", schoolId, pickClass], (c) => schoolOpsRepo.announcementClassStudents(c, schoolId, pickClass), { enabled: origin === "school" && scope.type === "student" && !!pickClass });
  const students = origin === "class" ? options.students : studentsQ.data ?? [];
  const selected = new Set(scope.studentIds ?? []);
  const toggleStudent = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    onScope({ type: "student", studentIds: [...n], classIds: origin === "class" ? [classId!] : pickClass ? [pickClass] : [] });
  };
  const typeOptions = origin === "class"
    ? [{ value: "class" as const, label: `Cả lớp ${options.classes[0]?.name ?? ""}`, description: "Gia đình của mọi học sinh đang học trong lớp" }, { value: "student" as const, label: "Học sinh cụ thể của lớp", description: "Thông báo riêng — gia đình khác không nhìn thấy" }]
    : [
      { value: "school" as const, label: "Toàn trường", description: "Mọi lớp đang hoạt động của năm học hiện tại" },
      { value: "grade" as const, label: "Theo khối" }, { value: "class" as const, label: "Theo lớp" },
      { value: "student" as const, label: "Học sinh cụ thể", description: "Chọn lớp rồi chọn học sinh" },
    ];
  const setType = (t: AnnouncementScope["type"]) => {
    if (t === "school") onScope({ type: "school" });
    else if (t === "grade") onScope({ type: "grade", gradeIds: [] });
    else if (t === "class") onScope(origin === "class" ? { type: "class", classIds: [classId!] } : { type: "class", classIds: [] });
    else onScope({ type: "student", studentIds: [], classIds: origin === "class" ? [classId!] : [] });
  };
  const toggleIn = (key: "gradeIds" | "classIds", id: string) => {
    const cur = new Set(scope[key] ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    onScope({ ...scope, [key]: [...cur] });
  };
  return (
    <div className="space-y-3" data-field="scope">
      <RadioGroup label="Phạm vi người nhận" value={scope.type} onChange={setType} options={typeOptions} direction={origin === "class" ? "col" : "row"} />
      {scope.type === "grade" && (
        <fieldset className="field"><legend className="label mb-1.5">Chọn khối</legend>
          <div className="flex flex-wrap gap-2">{options.grades.map((g) => <button key={g.id} type="button" className={clsx("chip", scope.gradeIds?.includes(g.id) && "chip-active")} aria-pressed={!!scope.gradeIds?.includes(g.id)} onClick={() => toggleIn("gradeIds", g.id)}>{g.name}</button>)}</div>
        </fieldset>
      )}
      {scope.type === "class" && origin === "school" && (
        <fieldset className="field"><legend className="label mb-1.5">Chọn lớp</legend>
          <div className="flex flex-wrap gap-2">{options.classes.map((c) => <button key={c.id} type="button" className={clsx("chip", scope.classIds?.includes(c.id) && "chip-active")} aria-pressed={!!scope.classIds?.includes(c.id)} onClick={() => toggleIn("classIds", c.id)}>{c.name}</button>)}</div>
        </fieldset>
      )}
      {scope.type === "student" && (
        <div className="space-y-2">
          {origin === "school" && (
            <SelectField label="Lớp của học sinh" value={pickClass} placeholder="Chọn lớp" options={options.classes.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(e) => { setPickClass(e.target.value); onScope({ type: "student", studentIds: [], classIds: e.target.value ? [e.target.value] : [] }); }} />
          )}
          {origin === "school" && pickClass && studentsQ.isLoading ? <Skeleton className="h-28" /> : (origin === "class" || pickClass) && (
            <fieldset className="field">
              <legend className="label mb-1.5">Học sinh nhận ({selected.size} đã chọn)</legend>
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">
                {students.map((s) => <Checkbox key={s.id} label={s.fullName} description={s.code} checked={selected.has(s.id)} onChange={() => toggleStudent(s.id)} className="rounded-lg px-2 py-1 hover:bg-[#f7fbff]" />)}
                {!students.length && <p className="p-2 text-sm text-muted">Lớp chưa có học sinh đang học.</p>}
              </div>
            </fieldset>
          )}
        </div>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}

/* ------------------------------ parent preview ------------------------------ */
export function ParentPreview({ title, summary, body, audience, files, isPublic }: { title: string; summary: string; body: BodyBlock[]; audience: Announcement["audience"]; files: { id: string; name: string }[]; isPublic: boolean }) {
  if (audience === "staff") return <Callout tone="neutral" icon={<Lock />} title="Phụ huynh không nhận thông báo này">Đối tượng là nội bộ nhân sự nên không xuất hiện trong trang tra cứu của gia đình.</Callout>;
  return (
    <article className="rounded-2xl border border-line bg-[#f7fbff] p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><Smartphone className="size-3.5" aria-hidden />Phụ huynh sẽ thấy</p>
      <h3 className="mt-2 text-[17px] font-bold leading-snug text-ink">{title.trim() || "Tiêu đề thông báo"}</h3>
      <p className="mt-1 text-[13.5px] text-muted">{summary.trim() || "Tóm tắt ngắn hiển thị ở danh sách thông báo."}</p>
      <div className="my-3 h-px bg-line" />
      <AnnouncementBody body={body} className="!text-[14px]" />
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">{files.map((f) => <li key={f.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[13px] text-ink"><Paperclip className="size-4 text-primary" aria-hidden />{f.name}</li>)}</ul>
      )}
      <p className="mt-3 text-[12px] text-muted">Ghi chú nội bộ không hiển thị với phụ huynh.{isPublic ? " Tin cũng xuất hiện trên trang công khai của trường." : ""}</p>
    </article>
  );
}

/* ------------------------------ C071 / O29 composer ------------------------------ */
function initialScope(origin: "school" | "class", classId?: string, a?: AnnouncementDetail): AnnouncementScope {
  if (a) return a.scope;
  return origin === "class" ? { type: "class", classIds: [classId!] } : { type: "school" };
}

export function AnnouncementComposer({ schoolId, origin, classId, announcement, onDone, onCancel }: { schoolId: string; origin: "school" | "class"; classId?: string; announcement?: AnnouncementDetail; onDone: (id: string) => void; /** optional: renders "Hủy" (asks before discarding unsaved changes) */ onCancel?: () => void }) {
  const leaveGuard = useLeaveGuard();
  const a = announcement;
  const optionsQ = useRepo(["ann-compose", schoolId, classId ?? ""], (c) => announcementsRepo.composeOptions(c, schoolId, origin === "class" ? classId : undefined));
  const init = useMemo(() => ({
    title: a?.title ?? "", summary: a?.summary ?? "", body: a?.body?.length ? a.body : [{ type: "p", text: "" }] as BodyBlock[],
    audience: (a?.audience ?? (origin === "class" ? "families" : "all")) as Announcement["audience"], scope: initialScope(origin, classId, a), isPublic: a?.isPublic ?? false,
    attachmentIds: a?.attachmentIds ?? [], internalNote: a?.internalNote ?? "",
    date: a?.scheduledAt?.slice(0, 10) ?? addDays(demoToday(), 1), time: a?.scheduledAt?.slice(11, 16) ?? "07:00",
  }), [a, origin, classId]);
  const [f, setF] = useState(init);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [preview, setPreview] = useState(false);
  const up = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k === "date" || k === "time" ? "scheduledAt" : k]: undefined as unknown as string })); };
  const dirty = !saved && JSON.stringify(f) !== JSON.stringify(init);

  const effectivePublic = origin === "school" && f.isPublic && f.scope.type === "school" && f.audience !== "staff";
  const estimateQ = useRepo(["ann-estimate", schoolId, f.scope, f.audience], (c) => announcementsRepo.estimate(c, schoolId, f.scope, f.audience));
  const scheduledAt = localDateTime(f.date, f.time || "07:00");
  const isPublished = a?.status === "published";

  const cmd = useCommand((ctx, action: Action) => announcementsRepo.save(ctx, schoolId, {
    id: a?.id, origin, originClassId: origin === "class" ? classId : undefined, title: f.title, summary: f.summary, body: f.body.filter((b) => b.text.trim()),
    audience: origin === "class" ? "families" : f.audience, scope: f.scope, isPublic: effectivePublic, attachmentIds: f.attachmentIds.filter((id) => (optionsQ.data?.files ?? []).some((x) => x.id === id && (x.share !== "student_parent" || f.scope.type === "student"))), internalNote: f.internalNote.trim() || undefined,
    action, scheduledAt: action === "schedule" ? scheduledAt : undefined, version: a?.version,
  }), {
    success: (r) => r.status === "published" ? (isPublished ? "Đã cập nhật thông báo đã công bố" : "Đã công bố thông báo") : r.status === "scheduled" ? "Đã đặt lịch công bố (mô phỏng)" : "Đã lưu bản nháp",
    onError: (e: RepoError) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? { form: e.message }); },
  });

  const submit = useCallback(async (action: Action) => {
    const r = await cmd.run(action);
    setConfirm(null);
    if (r) { setSaved(true); onDone(r.id); return true; }
    return false;
  }, [cmd, onDone]);
  useUnsavedChanges(dirty, useCallback(() => submit("draft"), [submit]));

  const localCheck = (action: Action) => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 5) e.title = "Tiêu đề tối thiểu 5 ký tự";
    if (f.summary.trim().length < 10) e.summary = "Tóm tắt tối thiểu 10 ký tự";
    if (!f.body.some((b) => b.text.trim())) e.body = "Nhập nội dung";
    if (action === "schedule" && scheduledAt <= demoNowISO()) e.scheduledAt = "Chọn thời điểm công bố sau hiện tại (theo đồng hồ demo)";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const start = (action: Action) => { if (!localCheck(action)) return; if (action === "draft" && !isPublished) submit("draft"); else setConfirm(action); };

  if (optionsQ.isLoading) return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><Skeleton className="h-[520px] rounded-[14px]" /><Skeleton className="h-80 rounded-[14px]" /></div>;
  if (optionsQ.error || !optionsQ.data) return <Callout tone="danger" title="Không tải được biểu mẫu">{optionsQ.error?.message}</Callout>;
  const opts = { ...optionsQ.data, files: optionsQ.data.files.filter((x) => x.share !== "student_parent" || f.scope.type === "student") };
  const files = opts.files.filter((x) => f.attachmentIds.includes(x.id));
  const est = estimateQ.data;
  const scopeText = f.scope.type === "school" ? "Toàn trường" : f.scope.type === "grade" ? `Khối: ${opts.grades.filter((g) => f.scope.gradeIds?.includes(g.id)).map((g) => g.name).join(", ") || "chưa chọn"}` : f.scope.type === "class" ? `Lớp: ${opts.classes.filter((c) => f.scope.classIds?.includes(c.id)).map((c) => c.name).join(", ") || "chưa chọn"}` : `${f.scope.studentIds?.length ?? 0} học sinh cụ thể`;
  const estimateLine = est ? `${fmtNumber(est.students)} gia đình học sinh · ${fmtNumber(est.activeLinks)} link tra cứu đang hiệu lực${est.staff ? ` · ${fmtNumber(est.staff)} nhân sự` : ""}` : "Đang ước tính…";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <ErrorSummary errors={errors} labels={{ title: "Tiêu đề", summary: "Tóm tắt", body: "Nội dung", scope: "Người nhận", isPublic: "Công khai", scheduledAt: "Thời điểm", form: "Biểu mẫu" }} />
        <Card>
          <CardHeader title="Nội dung" icon={<PenLine className="size-5" />} action={a && <Badge tone="info">Phiên bản {a.version}</Badge>} />
          <div className="space-y-4 px-5 pb-5">
            <div data-field="title"><TextField label="Tiêu đề" required value={f.title} maxLength={140} onChange={(e) => up("title", e.target.value)} error={errors.title} placeholder="Ví dụ: Lịch họp phụ huynh giữa học kỳ" /></div>
            <div data-field="summary"><TextArea label="Tóm tắt" required rows={2} maxChars={240} value={f.summary} onChange={(e) => up("summary", e.target.value)} error={errors.summary} helper="Hiển thị ở danh sách thông báo" /></div>
            <Field label="Nội dung chi tiết" required error={errors.body}><RichTextEditor value={f.body} onChange={(v) => up("body", v)} error={errors.body} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Người nhận" icon={<Users className="size-5" />} subtitle={origin === "class" ? "Thông báo lớp chỉ gửi gia đình của lớp hiện tại hoặc học sinh cụ thể trong lớp." : undefined} />
          <div className="space-y-4 px-5 pb-5">
            {origin === "school" ? (
              <RadioGroup label="Đối tượng" direction="row" value={f.audience} onChange={(v) => up("audience", v)} options={[
                { value: "all", label: ANNOUNCEMENT_AUDIENCE.all }, { value: "families", label: ANNOUNCEMENT_AUDIENCE.families }, { value: "staff", label: ANNOUNCEMENT_AUDIENCE.staff },
              ]} />
            ) : <p className="text-sm text-body"><span className="font-semibold text-ink">Đối tượng:</span> Gia đình học sinh</p>}
            <AudienceSelector schoolId={schoolId} origin={origin} classId={classId} options={opts} scope={f.scope} onScope={(s) => up("scope", s)} error={errors.scope} />
            <div className="flex items-start gap-3 rounded-xl bg-primary-light px-4 py-3 text-[13.5px] text-[#0b4c99]" aria-live="polite">
              <Users className="mt-0.5 size-4 flex-none" aria-hidden />
              <div><p className="font-semibold">Ước tính người nhận: {estimateLine}</p><p className="text-[12.5px]">Tính từ dữ liệu demo tại thời điểm soạn. Không gửi email/Zalo thật — phụ huynh đọc trong trang tra cứu.</p></div>
            </div>
            {origin === "school" && (
              <div data-field="isPublic">
                <Checkbox label={<span className="inline-flex items-center gap-1.5"><Globe className="size-4 text-primary" aria-hidden />Đăng lên trang công khai của trường</span>} checked={f.isPublic}
                  disabled={f.scope.type !== "school" || f.audience === "staff"} onChange={(v) => up("isPublic", v)}
                  description="Chỉ áp dụng cho thông báo toàn trường gửi gia đình. Không đăng thông tin riêng của học sinh." />
                {errors.isPublic && <p className="error-text mt-1">{errors.isPublic}</p>}
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Tệp đính kèm và ghi chú" icon={<Paperclip className="size-5" />} />
          <div className="space-y-4 px-5 pb-5">
            <fieldset className="field">
              <legend className="label mb-1.5">Tệp đã chia sẻ được đính kèm</legend>
              {opts.files.length ? (
                <div className="grid gap-1 sm:grid-cols-2">
                  {opts.files.map((x) => <Checkbox key={x.id} label={x.name} description={x.share === "class_parents" ? "Chia sẻ phụ huynh cả lớp" : "Chia sẻ riêng phụ huynh một học sinh"} checked={f.attachmentIds.includes(x.id)} className="rounded-lg px-2 py-1.5 hover:bg-[#f7fbff]"
                    onChange={(v) => up("attachmentIds", v ? [...f.attachmentIds, x.id] : f.attachmentIds.filter((id) => id !== x.id))} />)}
                </div>
              ) : <p className="text-sm text-muted">Chưa có tệp được chia sẻ. Tệp nội bộ và minh chứng học sinh không thể đính kèm.</p>}
              <p className="mt-1.5 text-[12px] text-muted">Tệp chia sẻ riêng cho phụ huynh một học sinh chỉ hiện khi gửi tới học sinh cụ thể.</p>
            </fieldset>
            <TextArea label={<span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden />Ghi chú nội bộ</span>} rows={2} value={f.internalNote} onChange={(e) => up("internalNote", e.target.value)} helper="Chỉ nhân sự nhìn thấy — không bao giờ hiển thị với phụ huynh." />
          </div>
        </Card>
        <Card>
          <CardHeader title="Công bố" icon={<Send className="size-5" />} subtitle="Lưu nháp để tiếp tục sau, công bố ngay hoặc đặt lịch công bố (mô phỏng theo đồng hồ demo)." />
          <div className="space-y-4 px-5 pb-5">
            {!isPublished && (
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]" data-field="scheduledAt">
                <DateField label="Ngày đặt lịch" value={f.date} min={demoToday()} onChange={(v) => up("date", v ?? demoToday())} error={errors.scheduledAt} />
                <Field label="Giờ" htmlFor="ann-time"><input id="ann-time" type="time" className="input" value={f.time} onChange={(e) => up("time", e.target.value)} /></Field>
              </div>
            )}
            {isPublished && <Callout tone="info" icon={<Info />}>Thông báo đang ở trạng thái đã công bố. Lưu thay đổi sẽ cập nhật nội dung phụ huynh đọc ở lần mở tiếp theo và được ghi vào lịch sử.</Callout>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" icon={<Eye className="size-4" />} onClick={() => setPreview(true)}>Xem trước như phụ huynh</Button>
              {onCancel && <Button variant="ghost" disabled={cmd.pending} onClick={() => leaveGuard(onCancel)}>Hủy</Button>}
              <div className="ml-auto flex flex-wrap gap-2">
                {isPublished ? <Button variant="primary" icon={<Save className="size-4" />} loading={cmd.pending} onClick={() => start("draft")}>Lưu thay đổi</Button> : <>
                  <Button icon={<Save className="size-4" />} loading={cmd.pending && !confirm} onClick={() => start("draft")}>Lưu nháp</Button>
                  <Button icon={<CalendarClock className="size-4" />} disabled={cmd.pending} onClick={() => start("schedule")}>Đặt lịch <DemoTag /></Button>
                  <Button variant="primary" icon={<Send className="size-4" />} disabled={cmd.pending} onClick={() => start("publish")}>Công bố ngay</Button>
                </>}
              </div>
            </div>
          </div>
        </Card>
      </div>
      <aside className="hidden min-w-0 xl:block">
        <div className="sticky top-4 space-y-3">
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><Eye className="size-4 text-primary" aria-hidden />Xem trước như phụ huynh</p>
            <ParentPreview title={f.title} summary={f.summary} body={f.body} audience={origin === "class" ? "families" : f.audience} files={files} isPublic={effectivePublic} />
          </Card>
          <Card className="space-y-1 p-4 text-[13px]">
            <p className="font-semibold text-ink">Tóm tắt gửi</p>
            <p className="text-body">Phạm vi: {scopeText}</p>
            <p className="text-body">Đối tượng: {ANNOUNCEMENT_AUDIENCE[origin === "class" ? "families" : f.audience]}</p>
            <p className="text-body">{estimateLine}</p>
          </Card>
        </div>
      </aside>

      <Modal open={preview} onOpenChange={setPreview} title="Xem trước như phụ huynh" description="Bản xem trước — chưa công bố cho ai." size="md" footer={<Button onClick={() => setPreview(false)}>Đóng</Button>}>
        <ParentPreview title={f.title} summary={f.summary} body={f.body} audience={origin === "class" ? "families" : f.audience} files={files} isPublic={effectivePublic} />
      </Modal>
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} busy={cmd.pending}
        title={confirm === "schedule" ? "Đặt lịch công bố (mô phỏng)" : confirm === "draft" ? "Cập nhật thông báo đã công bố" : "Công bố thông báo"}
        object={f.title || "Thông báo chưa đặt tiêu đề"} confirmLabel={confirm === "schedule" ? "Đặt lịch" : confirm === "draft" ? "Lưu thay đổi" : "Công bố"}
        onConfirm={async () => { if (confirm) await submit(confirm); }}
        consequence={<div className="space-y-1.5">
          <p><b>Phạm vi:</b> {scopeText} · <b>Đối tượng:</b> {ANNOUNCEMENT_AUDIENCE[origin === "class" ? "families" : f.audience]}</p>
          <p><b>Ước tính:</b> {estimateLine}</p>
          {confirm === "schedule" ? <p>Thông báo chuyển sang “Đã đặt lịch” cho {fmtDateTime(scheduledAt)}. Lịch hẹn chỉ là mô phỏng theo đồng hồ demo — không có máy chủ gửi tự động.</p>
            : <p>Người nhận thấy thông báo ở lần mở trang tra cứu kế tiếp. Không gửi email/Zalo thật. Nếu cần gỡ, có thể thu hồi — nhưng không thu hồi được nội dung đã được đọc hoặc chụp màn hình.</p>}
        </div>} />
      <ConflictDialog error={cmd.error} onClose={cmd.reset} onReload={() => { cmd.reset(); window.location.reload(); }} mine={<p className="text-sm">{f.title}</p>} />
    </div>
  );
}
