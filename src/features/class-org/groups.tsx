"use client";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { clsx } from "clsx";
import { Crown, Info, MoveRight, X, GripVertical, UserRound } from "lucide-react";
import type { StudentPositionKey } from "@/lib/model/types";
import { classroomRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { fmtDate, positionLabel } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { ClassOrgNav } from "./org-nav";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField, SelectField } from "@/components/ui/form";
import { QueryState } from "@/components/ui/states";

type Data = Awaited<ReturnType<typeof classroomRepo.groups>>;
const UNIQUE: StudentPositionKey[] = ["class_monitor", "secretary", "vice_study", "vice_labor"];
const COL_TONE = ["bg-[#fff4e0] text-[#9a5700]", "bg-[#f1ecff] text-[#5b3cc4]", "bg-[#e6f7f0] text-[#05744f]", "bg-[#e8f3ff] text-[#0659c2]"];

/** CL13 — groups & positions board (C065 / O23): drag-and-drop AND keyboard/select moves, effective date. */
export function GroupsBoard() {
  const { schoolId, yearId, classId } = useClassroom();
  const q = useRepo(["class-groups", classId], (ctx) => classroomRepo.groups(ctx, schoolId, yearId, classId));
  return (
    <div className="page">
      <ClassHeader title="Tổ & chức vụ" subtitle="Phân tổ và giao chức vụ cho học sinh theo ngày hiệu lực" crumbs={[{ label: "Tổ & chức vụ" }]} />
      <ClassOrgNav />
      <Callout tone="info" icon={<Info />} title="Chức vụ là dữ liệu tổ chức lớp, không phải tài khoản">Lớp trưởng, tổ trưởng… không đăng nhập và không nhập liệu thay giáo viên. Mỗi thay đổi có ngày hiệu lực; lịch sử cũ được giữ.</Callout>
      <QueryState query={q} skeleton="cards">{(d) => <Board d={d} />}</QueryState>
    </div>
  );
}

function Board({ d }: { d: Data }) {
  const { schoolId, classId, readOnly } = useClassroom();
  const ctx = useCtx();
  const editable = d.canEdit && !readOnly;
  const [date, setDate] = useState<string | undefined>(ctx.today);
  const [picked, setPicked] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [posErr, setPosErr] = useState<Record<string, string>>({});
  const [posPick, setPosPick] = useState<Record<string, string>>({});
  const students = useMemo(() => [...d.groups.flatMap((g) => g.members.map((m) => ({ ...m, groupId: g.id as string | null, groupName: g.name }))), ...d.unassigned.map((m) => ({ ...m, positions: [] as StudentPositionKey[], groupId: null, groupName: "Chưa phân tổ" }))], [d]);
  const byId = new Map(students.map((s) => [s.id, s]));
  const move = useCommand((c, sid: string, groupId: string | null) => classroomRepo.setGroup(c, schoolId, classId, { studentIds: [sid], groupId, effectiveDate: date! }), {
    success: () => "Đã chuyển tổ", onSuccess: () => { setPicked(null); setTarget(""); },
  });
  const posKey = useRef("");
  const setPos = useCommand((c, input: Parameters<typeof classroomRepo.setPosition>[3]) => classroomRepo.setPosition(c, schoolId, classId, input), {
    success: "Đã cập nhật chức vụ", onSuccess: () => setPosPick((x) => ({ ...x, [posKey.current]: "" })),
    onError: (e) => setPosErr((x) => ({ ...x, [posKey.current]: e.code === "DUPLICATE" ? `Trùng chức vụ: ${e.message}` : e.fieldErrors ? Object.values(e.fieldErrors).join("; ") : e.message })),
  });
  const doMove = (sid: string, groupId: string | null) => {
    if (!editable || !date) return;
    const s = byId.get(sid);
    if (!s || s.groupId === groupId) return;
    void move.run(sid, groupId);
  };
  const runPos = async (key: string, input: Parameters<typeof classroomRepo.setPosition>[3]) => {
    setPosErr((e) => ({ ...e, [key]: "" }));
    posKey.current = key;
    await setPos.run(input);
  };
  const onDrop = (e: DragEvent, groupId: string | null) => { e.preventDefault(); setDragOver(null); const sid = e.dataTransfer.getData("text/plain"); if (sid) doMove(sid, groupId); };
  const columns = [...d.groups.map((g, i) => ({ id: g.id as string | null, name: g.name, tone: COL_TONE[i % 4], members: g.members })), { id: null, name: "Chưa phân tổ", tone: "bg-neutral-bg text-neutral-text", members: d.unassigned.map((u) => ({ ...u, positions: [] as StudentPositionKey[] })) }];
  const holder = (p: StudentPositionKey, groupId?: string) => d.positions.find((x) => x.position === p && (!groupId || x.groupId === groupId));

  return (
    <div className="space-y-5">
      {editable && (
        <Card as="div" className="grid gap-3 p-4 md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <DateField label="Áp dụng từ ngày" required value={date} onChange={setDate} min={ctx.today} error={!date ? "Chọn ngày hiệu lực" : undefined} helper={<span className="sr-only">dd/MM/yyyy</span>} />
          <SelectField label="Chọn học sinh" value={picked ?? ""} onChange={(e) => setPicked(e.target.value || null)} placeholder="Chọn học sinh…" options={students.map((s) => ({ value: s.id, label: `${s.fullName} — ${s.groupName}` }))} />
          <SelectField label="Chuyển sang tổ" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Chọn tổ…" options={[...d.groups.map((g) => ({ value: g.id, label: g.name })), { value: "none", label: "Chưa phân tổ" }]} />
          <Button variant="primary" icon={<MoveRight className="size-4" />} loading={move.pending} disabled={!picked || !target || !date} onClick={() => picked && doMove(picked, target === "none" ? null : target)}>Chuyển</Button>
          <p className="text-[12.5px] text-muted md:col-span-4">Kéo thả thẻ học sinh giữa các cột, hoặc bấm vào thẻ để chọn rồi bấm “Chuyển vào đây” ở cột đích (dùng được bằng bàn phím).</p>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {columns.map((col) => (
          <section key={col.id ?? "none"} aria-label={`${col.name}, ${col.members.length} học sinh`}
            onDragOver={editable ? (e) => { e.preventDefault(); setDragOver(col.id ?? "none"); } : undefined} onDragLeave={() => setDragOver(null)} onDrop={editable ? (e) => onDrop(e, col.id) : undefined}
            className={clsx("card flex min-h-[200px] flex-col overflow-hidden transition-shadow", dragOver === (col.id ?? "none") && "ring-2 ring-primary")}>
            <header className={clsx("flex items-center justify-between px-3.5 py-2.5 font-bold", col.tone)}><span>{col.name}</span><span className="text-[12px] font-medium">{col.members.length} học sinh</span></header>
            <ul className="flex-1 space-y-1.5 p-2.5">
              {col.members.length === 0 && <li className="rounded-lg border border-dashed border-line p-3 text-center text-[12.5px] text-muted">Chưa có học sinh</li>}
              {col.members.map((m) => (
                <li key={m.id}>
                  <button type="button" draggable={editable} disabled={!editable} onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => setPicked((p) => (p === m.id ? null : m.id))} aria-pressed={picked === m.id}
                    className={clsx("flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px]", picked === m.id ? "border-primary bg-primary-light" : "border-line bg-white hover:border-[#9cc7f5]", editable && "cursor-grab", !editable && "cursor-default")}>
                    {editable && <GripVertical className="size-3.5 flex-none text-faint" aria-hidden />}
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{m.fullName}</span>{m.positions.length > 0 && <span className="block truncate text-[11.5px] text-warning-text">{m.positions.map((p) => positionLabel[p]).join(", ")}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
            {editable && picked && byId.get(picked)?.groupId !== col.id && (
              <div className="border-t border-line p-2.5"><Button block size="sm" variant="secondary" loading={move.pending} disabled={!date} onClick={() => doMove(picked, col.id)}>Chuyển {byId.get(picked)?.fullName.split(" ").pop()} vào đây</Button></div>
            )}
          </section>
        ))}
      </div>

      <Card>
        <CardHeader title="Chức vụ trong lớp" icon={<Crown className="size-5 text-warning" />} subtitle={`Hiệu lực tại ${fmtDate(d.date)} · Lớp trưởng, Bí thư, Lớp phó là duy nhất; mỗi tổ một tổ trưởng`} />
        <div className="grid gap-3 px-5 pb-5 lg:grid-cols-2">
          {UNIQUE.map((p) => <PositionRow key={p} label={positionLabel[p]} current={holder(p)} options={students.map((s) => ({ value: s.id, label: s.fullName }))} editable={editable} busy={setPos.pending} error={posErr[p]}
            pick={posPick[p] ?? ""} onPick={(v) => setPosPick((x) => ({ ...x, [p]: v }))}
            onAssign={(sid) => date && runPos(p, { studentId: sid, position: p, effectiveDate: date })}
            onRemove={(sid) => date && runPos(p, { studentId: sid, position: p, effectiveDate: date, remove: true })} />)}
          {d.groups.map((g) => <PositionRow key={g.id} label={`Tổ trưởng ${g.name}`} current={holder("group_leader", g.id)} options={g.members.map((s) => ({ value: s.id, label: s.fullName }))} editable={editable} busy={setPos.pending} error={posErr[g.id]}
            pick={posPick[g.id] ?? ""} onPick={(v) => setPosPick((x) => ({ ...x, [g.id]: v }))}
            onAssign={(sid) => date && runPos(g.id, { studentId: sid, position: "group_leader", effectiveDate: date })}
            onRemove={(sid) => date && runPos(g.id, { studentId: sid, position: "group_leader", effectiveDate: date, remove: true })} />)}
        </div>
      </Card>
    </div>
  );
}

function PositionRow({ label, current, options, editable, busy, error, pick, onPick, onAssign, onRemove }: {
  label: string; current?: { studentId: string; studentName: string; validFrom: string }; options: { value: string; label: string }[]; editable: boolean; busy: boolean; error?: string;
  pick: string; onPick: (v: string) => void; onAssign: (sid: string) => void; onRemove: (sid: string) => void;
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <UserRound className="size-4 text-primary" aria-hidden /><b className="text-ink">{label}</b>
        {current ? <Badge tone="warning" dot={false}>{current.studentName}</Badge> : <Badge tone="neutral">Chưa phân công</Badge>}
        {current && <span className="text-[12px] text-muted">từ {fmtDate(current.validFrom)}</span>}
        {editable && current && <Button size="sm" variant="ghost" className="ml-auto" icon={<X className="size-3.5" />} disabled={busy} onClick={() => onRemove(current.studentId)}>Bỏ chức vụ</Button>}
      </div>
      {editable && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select className="select min-w-0 flex-1" aria-label={`Chọn học sinh cho ${label}`} value={pick} onChange={(e) => onPick(e.target.value)}>
            <option value="">Chọn học sinh…</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={!pick || busy} onClick={() => onAssign(pick)}>Giao chức vụ</Button>
        </div>
      )}
      {error && <p className="error-text mt-1.5" role="alert">{error}</p>}
    </div>
  );
}

