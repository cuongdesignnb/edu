"use client";
import { useMemo, useState, type DragEvent } from "react";
import { clsx } from "clsx";
import { Undo2, Redo2, Save, Eraser, LayoutGrid, History, ListOrdered, Maximize2, Minimize2, Info } from "lucide-react";
import type { RepoError } from "@/lib/repositories";
import { classroomRepo } from "@/lib/repositories";
import { useCommand, useCtx, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { ClassOrgNav } from "./org-nav";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField, NumberField, TextField } from "@/components/ui/form";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { QueryState } from "@/components/ui/states";
import { ClassroomFrame, SeatMapView, seatKey, shortName } from "./seat-view";
import { initialSeatingLayout, resizeSeating, moveStudent, sameSeating, type SeatingLayout as Layout } from "./seating-layout";

type Data = Awaited<ReturnType<typeof classroomRepo.seating>>;
const studentDragType = "application/x-edumanage-student";
const seatLabel = (k: string) => { const m = k.match(/^r(\d+)c(\d+)$/); return m ? `Hàng ${m[1]}, ghế ${m[2]}` : k; };

/** CL14 — seating editor (C066 / O24): select-then-place (no drag required), undo/redo, effective date, versions. */
export function SeatingEditor() {
  const { schoolId, yearId, classId } = useClassroom();
  const q = useRepo(["class-seating", schoolId, yearId, classId], (ctx) => classroomRepo.seating(ctx, schoolId, yearId, classId));
  const [nonce, setNonce] = useState(0);
  return (
    <div className="page">
      <ClassHeader title="Sơ đồ lớp" subtitle="Xếp chỗ ngồi theo phiên bản và ngày áp dụng" crumbs={[{ label: "Sơ đồ lớp" }]} />
      <ClassOrgNav />
      <QueryState query={q} skeleton="detail">{(d) => <Editor key={`${Math.max(0, ...d.history.map((h) => h.version))}-${nonce}`} d={d} onReload={() => { void q.refetch().then(() => setNonce((n) => n + 1)); }} />}</QueryState>
    </div>
  );
}

function Editor({ d, onReload }: { d: Data; onReload: () => void }) {
  const { schoolId, yearId, classId, readOnly } = useClassroom();
  const ctx = useCtx();
  const editable = d.canEdit && !readOnly;
  const base = useMemo(() => initialSeatingLayout(d.plan), [d.plan]);
  const [stack, setStack] = useState<Layout[]>([base]);
  const [idx, setIdx] = useState(0);
  const layout = stack[idx];
  const [sel, setSel] = useState<{ kind: "student"; id: string } | { kind: "seat"; key: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [date, setDate] = useState<string | undefined>(d.date < d.today ? d.today : d.date);
  const [note, setNote] = useState("");
  const [fit, setFit] = useState(false);
  const [listMode, setListMode] = useState(false);
  const [conflict, setConflict] = useState<RepoError | null>(null);
  const [err, setErr] = useState<string>();
  const names = useMemo(() => new Map(d.students.map((s) => [s.id, s.fullName])), [d.students]);
  const seatOf = useMemo(() => { const m = new Map<string, string>(); Object.entries(layout.seats).forEach(([k, v]) => { if (v) m.set(v, k); }); return m; }, [layout]);
  const unseated = d.students.filter((s) => !seatOf.has(s.id));
  const dirty = !sameSeating(layout, base) || note.trim().length > 0 || date !== (d.date < d.today ? d.today : d.date);
  const latestVersion = d.latestRevision;

  const push = (next: Layout) => { const s = stack.slice(0, idx + 1); s.push(next); setStack(s); setIdx(s.length - 1); setErr(undefined); };
  const place = (studentId: string, key: string) => {
    if (!d.students.some(student => student.id === studentId)) return;
    const next = moveStudent(layout, studentId, key);
    if (next !== layout) push(next);
  };
  const clickSeat = (key: string) => {
    if (!editable) return;
    const occupant = layout.seats[key];
    if (sel?.kind === "student") { place(sel.id, key); setSel(null); return; }
    if (sel?.kind === "seat") {
      if (sel.key === key) { setSel(null); return; }
      const a = layout.seats[sel.key];
      if (a) place(a, key); else if (occupant) place(occupant, sel.key);
      setSel(null); return;
    }
    setSel({ kind: "seat", key });
    void occupant;
  };
  const clear = (key: string) => { if (!layout.seats[key]) return; push({ ...layout, seats: { ...layout.seats, [key]: null } }); setSel(null); };
  const autoFill = () => { const seats = { ...layout.seats }; const free = Object.keys(seats).filter((k) => !seats[k]); if (!free.length) {setErr("Không còn ghế trống. Hãy tăng số hàng hoặc ghế mỗi hàng.");return;}unseated.forEach((s, i) => { if (free[i]) seats[free[i]] = s.id; }); push({ ...layout, seats }); };
  const setSize = (rows: number, cols: number) => {
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 10 || cols > 10) return;
    const lost = lostOnShrink(rows, cols);
    push(resizeSeating(layout, rows, cols));setSel(null);
    if (lost) setErr(`${lost} học sinh được chuyển về danh sách chưa có chỗ. Có thể Hoàn tác để khôi phục.`);
  };
  const lostOnShrink = (rows: number, cols: number) => Object.entries(layout.seats).filter(([k, v]) => { const m = k.match(/^r(\d+)c(\d+)$/)!; return v && (Number(m[1]) > rows || Number(m[2]) > cols); }).length;

  const save = useCommand((c) => classroomRepo.saveSeating(c, schoolId, classId, { yearId, rows: layout.rows, cols: layout.cols, seats: Object.entries(layout.seats).map(([seat, studentId]) => ({ seat, studentId })), effectiveDate: date!, basedOnVersion: latestVersion, note: note.trim() || undefined }), {
    success: (p) => `Đã lưu sơ đồ phiên bản ${p.version}, áp dụng từ ${fmtDate(p.effectiveDate)}`,
    onError: (e) => { if (e.code === "CONFLICT") setConflict(e); else if (e.code === "VALIDATION") setErr(e.fieldErrors ? Object.values(e.fieldErrors).join("; ") : e.message); },
  });
  const doSave = async () => { if (!date) { setErr("Chọn ngày áp dụng"); return false; } return !!(await save.run()); };
  const discard = () => { setStack([base]);setIdx(0);setSel(null);setDropTarget(null);setDate(d.date < d.today ? d.today : d.date);setNote("");setErr(undefined); };
  const startDrag = (event: DragEvent<HTMLElement>, studentId: string) => {
    if (!editable || save.pending) { event.preventDefault();return; }
    event.dataTransfer.setData(studentDragType, studentId);event.dataTransfer.effectAllowed="move";setSel({kind:"student",id:studentId});
  };
  const dragOver = (event: DragEvent<HTMLElement>, key: string) => {
    if (!editable || save.pending || !event.dataTransfer.types.includes(studentDragType)) return;
    event.preventDefault();event.dataTransfer.dropEffect="move";setDropTarget(key);
  };
  const dropStudent = (event: DragEvent<HTMLElement>, key: string) => {
    event.preventDefault();if (editable && !save.pending) place(event.dataTransfer.getData(studentDragType), key);setSel(null);setDropTarget(null);
  };
  useUnsavedChanges(dirty && editable, doSave);
  const selectedName = sel?.kind === "student" ? names.get(sel.id) : sel?.kind === "seat" ? (layout.seats[sel.key] ? names.get(layout.seats[sel.key]!) : `${seatLabel(sel.key)} (trống)`) : undefined;
  const cell = fit ? "h-12 text-[11px]" : "h-14 min-w-[92px] text-[12.5px]";

  return (
    <fieldset disabled={save.pending} className="grid min-w-0 gap-5 border-0 p-0 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        {!editable && <Callout tone="neutral" icon={<Info />}>Bạn đang xem sơ đồ ở chế độ chỉ đọc{readOnly ? " (năm học đã lưu trữ)" : " — chỉ giáo viên có quyền “Quản lý sơ đồ lớp” được thay đổi"}.</Callout>}
        <Card>
          <CardHeader title={editable ? "Chỉnh sơ đồ" : "Sơ đồ hiện hành"} icon={<LayoutGrid className="size-5 text-primary" />}
            subtitle={d.plan ? `Phiên bản ${d.plan.version} · áp dụng từ ${fmtDate(d.plan.effectiveDate)}` : "Chưa có sơ đồ — tạo phiên bản đầu tiên"}
            action={editable && <>
              <Button size="sm" variant="primary" icon={<Save className="size-4" />} disabled={!dirty || !date} loading={save.pending} onClick={() => void doSave()}>Lưu thay đổi</Button>
              <Button size="sm" variant="secondary" icon={<Undo2 className="size-4" />} disabled={idx === 0} onClick={() => { setIdx(idx - 1); setSel(null);setErr(undefined); }}>Hoàn tác</Button>
              <Button size="sm" variant="secondary" icon={<Redo2 className="size-4" />} disabled={idx >= stack.length - 1} onClick={() => { setIdx(idx + 1); setSel(null);setErr(undefined); }}>Làm lại</Button>
              <Button size="sm" variant="ghost" onClick={() => setFit((f) => !f)} icon={fit ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} className="lg:hidden">{fit ? "Cỡ thường" : "Vừa màn hình"}</Button>
              <Button size="sm" variant="ghost" icon={<ListOrdered className="size-4" />} aria-pressed={listMode} onClick={() => setListMode((m) => !m)}>{listMode ? "Xem dạng lưới" : "Xếp dạng danh sách"}</Button>
            </>} />
          <div className="px-4 pb-4">
            {editable && <div className="mb-3 rounded-xl border border-line bg-neutral-bg p-3">
              <p className="mb-2 text-sm font-semibold text-ink">Điều chỉnh sơ đồ · {layout.rows} hàng × {layout.cols} ghế</p>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Số hàng" value={layout.rows} min={1} max={10} allowNegative={false} onChange={v => { if (v && v !== layout.rows) setSize(v, layout.cols); }} />
                <NumberField label="Ghế mỗi hàng" value={layout.cols} min={1} max={10} allowNegative={false} onChange={v => { if (v && v !== layout.cols) setSize(layout.rows, v); }} />
              </div>
              <p className="mt-2 text-xs text-muted">Kéo học sinh đến ghế đích trên máy tính, hoặc chọn học sinh rồi bấm ghế. Chọn hai ghế có người để đổi chỗ.</p>
            </div>}
            {editable && <p className="mb-2 min-h-5 text-[13px] text-body" aria-live="polite">{selectedName ? <>Đang chọn: <b className="text-primary-strong">{selectedName}</b> — bấm một ghế để {sel?.kind === "student" ? "xếp vào" : "đổi chỗ"}, hoặc bấm lại để bỏ chọn.</> : `${d.students.length - unseated.length}/${d.students.length} học sinh đã có chỗ. Thay đổi chỉ áp dụng khi bạn bấm Lưu.`}</p>}
            {!editable ? (
              <ClassroomFrame><SeatMapView rows={layout.rows} cols={layout.cols} seats={Object.entries(layout.seats).map(([seat, studentId]) => ({ seat, studentId }))} names={names} /></ClassroomFrame>
            ) : listMode ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.students.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1"><b className="text-ink">{s.fullName}</b> <span className="text-muted">· {d.groupsVisible ? s.groupName ?? "Chưa phân tổ" : "Không có quyền xem tổ"}</span></span>
                    <select className="select w-full sm:w-[230px]" aria-label={`Ghế của ${s.fullName}`} value={seatOf.get(s.id) ?? ""} onChange={(e) => { if (e.target.value) place(s.id, e.target.value); else { const k = seatOf.get(s.id); if (k) clear(k); } }}>
                      <option value="">Chưa có chỗ</option>
                      {Object.keys(layout.seats).map((k) => <option key={k} value={k}>{seatLabel(k)}{layout.seats[k] && layout.seats[k] !== s.id ? ` — đổi với ${shortName(names.get(layout.seats[k]!) ?? "")}` : ""}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="overflow-x-auto" role="region" aria-label="Lưới ghế (cuộn ngang trên màn hình nhỏ)" tabIndex={0}>
                <ClassroomFrame className={fit ? "" : "min-w-[640px]"}>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
                    {Array.from({ length: layout.rows }, (_, r) => Array.from({ length: layout.cols }, (_, c) => {
                      const k = seatKey(r + 1, c + 1);
                      const sid = layout.seats[k];
                      const nm = sid ? names.get(sid) : undefined;
                      const on = sel?.kind === "seat" && sel.key === k;
                      return (
                        <button key={k} type="button" data-seat={k} onClick={() => clickSeat(k)} aria-pressed={on} aria-label={`${seatLabel(k)}: ${nm ?? "trống"}`} title={nm ? `${nm} — kéo để đổi chỗ` : seatLabel(k)}
                          draggable={!!sid && !save.pending} onDragStart={event => { if (sid) startDrag(event, sid); }} onDragEnd={() => {setSel(null);setDropTarget(null);}}
                          onDragOver={event => dragOver(event, k)} onDragLeave={() => setDropTarget(null)} onDrop={event => dropStudent(event, k)}
                          className={clsx("flex items-center justify-center rounded-lg border px-1 text-center shadow-sm transition-colors focus-visible:outline-2", cell,
                            on ? "border-primary bg-primary text-white" : nm ? "border-[#e6dccb] bg-white text-ink hover:border-primary" : "border-dashed border-[#cdb68f] bg-[#f8efe0] text-[#7a6446] hover:border-primary",
                            sel && !on && "ring-1 ring-primary/30", dropTarget === k && "!border-primary !bg-primary-light !text-primary-strong ring-2 ring-primary")}>
                          <span className="line-clamp-2">{nm ? (fit ? nm.split(" ").pop() : shortName(nm)) : "Trống"}</span>
                        </button>
                      );
                    }))}
                  </div>
                </ClassroomFrame>
              </div>
            )}
            {editable && sel?.kind === "seat" && layout.seats[sel.key] && <Button size="sm" variant="danger-soft" className="mt-3" icon={<Eraser className="size-4" />} onClick={() => clear(sel.key)}>Để trống {seatLabel(sel.key)}</Button>}
          </div>
        </Card>
      </div>

      <div className="min-w-0 space-y-5">
        {editable && (
          <Card>
            <CardHeader title="Học sinh chưa có chỗ" subtitle={`${unseated.length} / ${d.students.length} học sinh`} action={unseated.length > 0 && <Button size="sm" variant="secondary" onClick={autoFill}>Xếp vào ghế trống</Button>} />
            <div className="px-5 pb-5">
              {unseated.length === 0 ? <p className="text-sm text-success-text">Tất cả học sinh đã có chỗ.</p> : (
                <ul className="flex flex-wrap gap-1.5">
                  {unseated.map((s) => (
                    <li key={s.id}><button type="button" aria-label={`${s.fullName} (${s.code})`} title={s.code} draggable={!save.pending} onDragStart={event => startDrag(event, s.id)} onDragEnd={() => {setSel(null);setDropTarget(null);}} aria-pressed={sel?.kind === "student" && sel.id === s.id} onClick={() => setSel((x) => (x?.kind === "student" && x.id === s.id ? null : { kind: "student", id: s.id }))}
                      className={clsx("chip", sel?.kind === "student" && sel.id === s.id && "chip-active")}>{s.fullName}</button></li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}
        {editable && (
          <Card>
            <CardHeader title="Lưu phiên bản mới" icon={<Save className="size-5 text-primary" />} />
            <div className="space-y-3 px-5 pb-5">
              <DateField label="Ngày áp dụng" required value={date} onChange={setDate} min={ctx.today} error={!date ? "Chọn ngày áp dụng" : undefined} />
              <TextField label="Ghi chú phiên bản" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Ví dụ: đổi chỗ đầu tháng 10" />
              {err && <p className="error-text" role="alert">{err}</p>}
              <Button block variant="primary" icon={<Save className="size-4" />} loading={save.pending} disabled={!dirty || !date} onClick={() => void doSave()}>Lưu phiên bản {latestVersion + 1}</Button>
              <Button block variant="ghost" disabled={!dirty || save.pending} onClick={discard}>Hủy thay đổi</Button>
              <p className="text-[12px] text-muted">Mỗi học sinh chỉ ở một ghế trong một phiên bản. Phiên bản cũ được giữ trong lịch sử.</p>
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title="Lịch sử phiên bản" icon={<History className="size-5 text-primary" />} />
          {d.history.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Chưa có phiên bản nào.</p> : (
            <ul className="space-y-2 px-5 pb-5">
              {d.history.map((h) => (
                <li key={h.id} className="rounded-xl border border-line px-3 py-2 text-[13px]">
                  <p className="flex flex-wrap items-center gap-2"><b className="text-ink">Phiên bản {h.version}</b>{(() => { const st = h.version === d.plan?.version ? { tone: "success" as const, label: "Đang áp dụng" } : h.status === "active" && h.effectiveDate > d.date ? { tone: "info" as const, label: `Đã lên lịch từ ${fmtDate(h.effectiveDate)}` } : h.status === "draft" ? { tone: "neutral" as const, label: "Nháp" } : { tone: "neutral" as const, label: "Đã thay bằng bản mới" }; return <Badge tone={st.tone}>{st.label}</Badge>; })()}</p>
                  <p className="text-muted">Áp dụng từ {fmtDate(h.effectiveDate)} · {h.createdByName} · {fmtDateTime(h.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <ConflictDialog error={conflict} onClose={() => setConflict(null)} onReload={() => { setConflict(null); onReload(); }} mine={<p>Sơ đồ bạn đang chỉnh ({layout.rows} × {layout.cols}, {d.students.length - unseated.length} học sinh đã có chỗ) chưa được lưu.</p>} />
    </fieldset>
  );
}
