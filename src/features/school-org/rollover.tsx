"use client";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, CalendarPlus, CheckCircle2, ChevronDown, Info, Plus, ShieldCheck } from "lucide-react";
import { schoolRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { useSchool } from "@/components/layout/shells";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup } from "@/components/ui/form";
import { Stepper } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, QueryState } from "@/components/ui/states";
import { useUnsavedChanges } from "@/components/ui/guards";
import { fmtDate, fmtNumber } from "@/lib/formatters";
import { yearStatus } from "./common";

type Preview = Awaited<ReturnType<typeof schoolRepo.rolloverPreview>>;
type Action = "promote" | "retain" | "leave";
const ACTION_LABEL: Record<Action, string> = { promote: "Lên lớp", retain: "Ở lại khối", leave: "Chuyển đi / tốt nghiệp" };
const STEPS = ["Năm học đích", "Quyết định theo lớp", "Xem trước & xác nhận"];

/** SC07 — end of year: choose target year, decide per class/student, preview counts, apply. The source year is never modified. */
export function Rollover({ yearId }: { yearId: string }) {
  const { school } = useSchool();
  const q = useRepo(["school-rollover", school.id, yearId], (c) => schoolRepo.rolloverPreview(c, school.id, yearId));
  return <QueryState query={q} skeleton="form">{(d) => <RolloverBody d={d} />}</QueryState>;
}

function RolloverBody({ d }: { d: Preview }) {
  const { school } = useSchool();
  const b = `/school/${school.id}`;
  const [step, setStep] = useState(0);
  const [targetId, setTargetId] = useState(d.targets[0]?.year.id ?? "");
  const target = d.targets.find((t) => t.year.id === targetId);
  const gradeLevel = (gid: string) => d.grades.find((g) => g.id === gid)?.level ?? 0;
  const targetClasses = target?.classes ?? [];
  const suggest = (clsName: string, level: number, action: Action) => {
    if (action === "leave") return "";
    const want = action === "promote" ? level + 1 : level;
    const same = targetClasses.find((c) => gradeLevel(c.gradeId) === want && c.name.replace(/^\d+/, "") === clsName.replace(/^\d+/, ""));
    return same?.id ?? targetClasses.find((c) => gradeLevel(c.gradeId) === want)?.id ?? "";
  };
  const maxLevel = Math.max(0, ...d.grades.map((g) => g.level));
  const initialDecisions = useMemo(() => Object.fromEntries(d.classes.flatMap((c) => c.students.map((s) => {
    const action: Action = s.status !== "studying" || c.gradeLevel >= maxLevel ? "leave" : "promote";
    return [s.id, { action, targetClassId: suggest(c.name, c.gradeLevel, action) }];
  }))), [d, targetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [decisions, setDecisions] = useState<Record<string, { action: Action; targetClassId: string }>>(initialDecisions);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ enrolled: number; left: number } | null>(null);
  useUnsavedChanges(touched && !result);
  const pickTarget = (id: string) => { setTargetId(id); setTouched(false); setDecisions({}); };
  const eff = Object.keys(decisions).length ? decisions : initialDecisions;

  const apply = useCommand((c, list: { studentId: string; action: Action; targetClassId?: string }[]) => schoolRepo.rolloverApply(c, school.id, d.from.id, targetId, list), {
    success: (r) => `Đã xếp ${r.enrolled} học sinh vào năm ${target?.year.label}`,
  });

  const setClass = (classId: string, action: Action, targetClassId?: string) => {
    const c = d.classes.find((x) => x.id === classId)!;
    const tid = targetClassId ?? suggest(c.name, c.gradeLevel, action);
    setTouched(true);
    setDecisions({ ...eff, ...Object.fromEntries(c.students.map((s) => [s.id, { action, targetClassId: action === "leave" ? "" : tid }])) });
  };
  const setStudent = (sid: string, patch: Partial<{ action: Action; targetClassId: string }>) => { setTouched(true); setDecisions({ ...eff, [sid]: { ...eff[sid], ...patch } }); };

  const all = d.classes.flatMap((c) => c.students.map((s) => ({ ...s, classId: c.id, ...eff[s.id] })));
  const counts = { promote: all.filter((x) => x.action === "promote").length, retain: all.filter((x) => x.action === "retain").length, leave: all.filter((x) => x.action === "leave").length };
  const missing = all.filter((x) => x.action !== "leave" && !x.targetClassId).length;
  const byTarget = targetClasses.map((c) => ({ ...c, incoming: all.filter((x) => x.action !== "leave" && x.targetClassId === c.id).length }));

  const header = (
    <PageHeader title="Kết thúc năm và chuẩn bị năm mới" subtitle={`Từ năm học ${d.from.label} — dữ liệu năm cũ được giữ nguyên, không ghi đè`}
      breadcrumbs={[{ label: "Nhà trường", href: b }, { label: "Năm học", href: `${b}/academic-years` }, { label: d.from.label, href: `${b}/academic-years/${d.from.id}` }, { label: "Chuẩn bị năm mới" }]} />
  );

  if (result) return (
    <div className="page">{header}
      <Card className="p-6"><div className="flex items-start gap-4"><span className="icon-tile tone-green" aria-hidden><CheckCircle2 className="size-7" /></span>
        <div className="space-y-2"><p className="text-[18px] font-bold text-ink">Đã xếp lớp năm học {target?.year.label}</p>
          <p className="text-sm text-body">{fmtNumber(result.enrolled)} học sinh được ghi danh vào lớp năm mới; {fmtNumber(result.left)} học sinh không chuyển tiếp. Năm học {d.from.label} và lịch sử lớp cũ không thay đổi. Phân công giáo viên năm mới thực hiện ở Ma trận phân công.</p>
          <div className="flex flex-wrap gap-2 pt-1"><ButtonLink href={`${b}/academic-years/${targetId}`} variant="primary">Mở năm học {target?.year.label}</ButtonLink><ButtonLink href={`${b}/assignments`}>Phân công giáo viên</ButtonLink><ButtonLink href={`${b}/academic-years`}>Về danh sách năm học</ButtonLink></div>
        </div></div></Card>
    </div>
  );

  return (
    <div className="page">
      {header}
      <Card className="px-5 py-4"><Stepper steps={STEPS} current={step} onStep={setStep} /></Card>
      {step === 0 && (
        <Card>
          <CardHeader title="Chọn năm học đích" icon={<CalendarPlus className="size-5 text-primary" />} subtitle="Học sinh được ghi danh vào lớp của năm học đích; năm hiện tại giữ nguyên." />
          <div className="space-y-4 px-5 pb-5">
            {d.targets.length === 0 ? (
              <EmptyState compact icon={<CalendarPlus className="size-6" />} title="Chưa có năm học mới" description={`Cần tạo năm học sau ${d.from.label} (trạng thái Nháp) trước khi xếp lớp. Việc tạo năm không di chuyển học sinh.`}
                action={<ButtonLink href={`${b}/academic-years/new`} variant="primary" icon={<Plus className="size-4" />}>Tạo năm học mới</ButtonLink>} />
            ) : (
              <>
                <RadioGroup label="Năm học đích" value={targetId} onChange={pickTarget} options={d.targets.map((t) => ({ value: t.year.id, label: `Năm học ${t.year.label}`, description: `${yearStatus[t.year.status].label} · ${fmtDate(t.year.startDate)} – ${fmtDate(t.year.endDate)} · ${t.classes.length} lớp đã tạo` }))} />
                {target && target.classes.length === 0 && (
                  <Callout tone="warning" title="Năm đích chưa có lớp" action={<ButtonLink size="sm" href={`${b}/classes?new=1&year=${target.year.id}`}>Tạo lớp năm mới</ButtonLink>}>Tạo các lớp (ví dụ 11A1, 12A1…) cho năm {target.year.label} rồi quay lại bước này.</Callout>
                )}
                <div className="flex justify-end"><Button variant="primary" iconRight={<ArrowRight className="size-4" />} disabled={!target || target.classes.length === 0} onClick={() => setStep(1)}>Tiếp tục</Button></div>
              </>
            )}
          </div>
        </Card>
      )}
      {step === 1 && target && (
        <Card>
          <CardHeader title="Quyết định theo lớp" subtitle="Chọn cho cả lớp, mở rộng để điều chỉnh từng học sinh. Không có mặc định “chuyển tất cả”." />
          <div className="space-y-3 px-5 pb-5">
            {d.classes.length === 0 && <EmptyState compact title="Năm hiện tại không có lớp đang hoạt động" />}
            {d.classes.map((c) => <ClassDecision key={c.id} c={c} eff={eff} targetClasses={targetClasses} gradeLevel={gradeLevel} maxLevel={maxLevel} onClass={setClass} onStudent={setStudent} />)}
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
              <Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep(0)}>Quay lại</Button>
              <Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={() => setStep(2)}>Xem trước</Button>
            </div>
          </div>
        </Card>
      )}
      {step === 2 && target && (
        <Card>
          <CardHeader title="Xem trước" icon={<ShieldCheck className="size-5 text-primary" />} subtitle={`Năm ${d.from.label} → ${target.year.label}`} />
          <div className="space-y-4 px-5 pb-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Lên lớp" value={counts.promote} tone="text-success-text" />
              <Stat label="Ở lại khối" value={counts.retain} tone="text-warning-text" />
              <Stat label="Chuyển đi / tốt nghiệp" value={counts.leave} tone="text-muted" />
              <Stat label="Chưa chọn lớp đích" value={missing} tone={missing ? "text-danger-text" : "text-muted"} />
            </div>
            <div className="table-wrap rounded-xl border border-line" role="region" aria-label="Sĩ số dự kiến lớp đích" tabIndex={0}>
              <table className="table" style={{ minWidth: 420 }}>
                <thead><tr><th>Lớp năm {target.year.label}</th><th className="num">Đã có</th><th className="num">Xếp thêm</th><th className="num">Dự kiến</th></tr></thead>
                <tbody>{byTarget.map((c) => <tr key={c.id}><td className="font-semibold text-ink">{c.name}</td><td className="num">{c.size}</td><td className="num">{c.incoming}</td><td className="num font-semibold">{c.size + c.incoming}</td></tr>)}</tbody>
              </table>
            </div>
            {missing > 0 ? <Callout tone="danger" title={`${missing} học sinh chưa có lớp đích`}>Quay lại bước 2 để chọn lớp, hoặc đổi thành “Chuyển đi / tốt nghiệp”.</Callout>
              : <Callout tone="info" icon={<Info />}>Chỉ tạo ghi danh mới ở năm {target.year.label}. Lớp, điểm danh, thi đua và lịch sử của năm {d.from.label} không đổi. Học sinh đã có lớp ở năm đích sẽ được bỏ qua (không nhân đôi).</Callout>}
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
              <Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep(1)}>Quay lại</Button>
              <Button variant="primary" disabled={missing > 0 || all.length === 0} onClick={() => setConfirm(true)}>Xác nhận xếp lớp</Button>
            </div>
          </div>
        </Card>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} busy={apply.pending} title="Xác nhận xếp lớp năm mới" object={`${fmtNumber(counts.promote + counts.retain)} học sinh → năm ${target?.year.label}`}
        confirmLabel="Xếp lớp" consequence={`${counts.promote} lên lớp, ${counts.retain} ở lại khối, ${counts.leave} không chuyển tiếp. Năm ${d.from.label} được giữ nguyên.`}
        onConfirm={async () => { const r = await apply.run(all.map((x) => ({ studentId: x.id, action: x.action, targetClassId: x.action === "leave" ? undefined : x.targetClassId }))); if (r) { setConfirm(false); setResult(r); } }} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-xl border border-line p-3"><p className="text-[12.5px] text-muted">{label}</p><p className={clsx("text-[24px] font-extrabold", tone)}>{fmtNumber(value)}</p></div>;
}

function ClassDecision({ c, eff, targetClasses, gradeLevel, maxLevel, onClass, onStudent }: {
  c: Preview["classes"][number]; eff: Record<string, { action: Action; targetClassId: string }>; targetClasses: { id: string; name: string; gradeId: string }[]; gradeLevel: (g: string) => number; maxLevel: number;
  onClass: (classId: string, a: Action, target?: string) => void; onStudent: (sid: string, p: Partial<{ action: Action; targetClassId: string }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const acts = c.students.map((s) => eff[s.id]?.action);
  const uniform = acts.every((a) => a === acts[0]) ? acts[0] : undefined;
  const tids = c.students.map((s) => eff[s.id]?.targetClassId);
  const uniformTarget = tids.every((t) => t === tids[0]) ? tids[0] : undefined;
  const optsFor = (a: Action) => targetClasses.filter((t) => gradeLevel(t.gradeId) === (a === "promote" ? c.gradeLevel + 1 : c.gradeLevel));
  return (
    <section className="rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-[120px] flex-1"><p className="font-bold text-ink">Lớp {c.name}</p><p className="text-[12.5px] text-muted">{c.students.length} học sinh{c.gradeLevel >= maxLevel ? " · khối cuối cấp" : ""}</p></div>
        <select aria-label={`Quyết định cho lớp ${c.name}`} className="select !w-auto min-w-[170px]" value={uniform ?? ""} onChange={(e) => onClass(c.id, e.target.value as Action)}>
          {!uniform && <option value="">Nhiều lựa chọn</option>}
          {(Object.keys(ACTION_LABEL) as Action[]).filter((a) => a !== "promote" || c.gradeLevel < maxLevel).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
        </select>
        {uniform && uniform !== "leave" && (
          <select aria-label={`Lớp đích cho lớp ${c.name}`} className="select !w-auto min-w-[150px]" value={uniformTarget ?? ""} onChange={(e) => onClass(c.id, uniform, e.target.value)}>
            <option value="">Chọn lớp đích</option>
            {optsFor(uniform).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {uniform && uniform !== "leave" && optsFor(uniform).length === 0 && <Badge tone="danger">Năm đích chưa có lớp khối {uniform === "promote" ? c.gradeLevel + 1 : c.gradeLevel}</Badge>}
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} iconRight={<ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} />}>Từng học sinh</Button>
      </div>
      {open && (
        <ul className="max-h-[360px] divide-y divide-line overflow-y-auto border-t border-line">
          {c.students.map((s) => {
            const dcs = eff[s.id];
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                <span className="min-w-[180px] flex-1"><span className="font-medium text-ink">{s.fullName}</span> <span className="text-[12px] text-muted">{s.code}</span>{s.status !== "studying" && <Badge tone="neutral" className="ml-2">Đã rời trường</Badge>}</span>
                <select aria-label={`Quyết định cho ${s.fullName}`} className="select !min-h-9 !w-auto !py-0 text-[13px]" value={dcs?.action} onChange={(e) => { const a = e.target.value as Action; onStudent(s.id, { action: a, targetClassId: a === "leave" ? "" : optsFor(a)[0]?.id ?? "" }); }}>
                  {(Object.keys(ACTION_LABEL) as Action[]).filter((a) => a !== "promote" || c.gradeLevel < maxLevel).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
                </select>
                {dcs?.action !== "leave" && (
                  <select aria-label={`Lớp đích cho ${s.fullName}`} className="select !min-h-9 !w-auto !py-0 text-[13px]" value={dcs?.targetClassId ?? ""} onChange={(e) => onStudent(s.id, { targetClassId: e.target.value })}>
                    <option value="">Chọn lớp đích</option>
                    {optsFor(dcs?.action ?? "promote").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
