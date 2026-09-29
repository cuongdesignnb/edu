"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Plus, Trash2, Save, Send, Calculator, GitCompare, ListChecks, SlidersHorizontal, Lock, Info, Copy, Minus } from "lucide-react";
import type { ConductRule, GradeBand, RuleSet } from "@/lib/model/types";
import { conductRepo, type RepoError } from "@/lib/repositories";
import { useCommand } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime, fmtPoints } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { useSchool } from "@/components/layout/shells";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DateField, ErrorSummary, NumberField, TextField } from "@/components/ui/form";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { RULESET_STATUS } from "./rule-sets";

type Data = Awaited<ReturnType<typeof conductRepo.ruleSet>>;
const CATEGORIES: ConductRule["category"][] = ["Chuyên cần", "Nề nếp", "Học tập", "Phong trào"];

interface Form { name: string; baseScore?: number; cap?: number; floor?: number; rules: ConductRule[]; bands: GradeBand[]; effectiveFrom?: string; entryDeadlineDays?: number }
const toForm = (r: RuleSet): Form => ({ name: r.name, baseScore: r.baseScore, cap: r.cap, floor: r.floor, rules: r.rules.map((x) => ({ ...x })), bands: r.bands.map((b) => ({ ...b })), effectiveFrom: r.effectiveFrom, entryDeadlineDays: r.entryDeadlineDays });

/** Diff of a version vs the previous published version (rules + scoring). */
function diffOf(prev: RuleSet | null, cur: Form) {
  if (!prev) return [];
  const out: { kind: "add" | "remove" | "change"; text: string }[] = [];
  for (const r of cur.rules) {
    const p = prev.rules.find((x) => x.id === r.id || x.code === r.code);
    if (!p) { out.push({ kind: "add", text: `${r.code} ${r.label} (${fmtPoints(r.points)})` }); continue; }
    const ch: string[] = [];
    if (p.points !== r.points) ch.push(`điểm ${fmtPoints(p.points)} → ${fmtPoints(r.points)}`);
    if (p.label !== r.label) ch.push(`tên “${p.label}” → “${r.label}”`);
    if (p.category !== r.category) ch.push(`nhóm ${p.category} → ${r.category}`);
    if (p.shareWithParent !== r.shareWithParent) ch.push(r.shareWithParent ? "chia sẻ phụ huynh" : "không chia sẻ phụ huynh");
    if ((p.attendanceLink ?? "") !== (r.attendanceLink ?? "")) ch.push(`liên kết điểm danh: ${r.attendanceLink ? (r.attendanceLink === "late" ? "đi muộn" : "nghỉ không phép") : "không"}`);
    if (ch.length) out.push({ kind: "change", text: `${r.code} ${r.label}: ${ch.join(", ")}` });
  }
  for (const p of prev.rules) if (!cur.rules.some((x) => x.id === p.id || x.code === p.code)) out.push({ kind: "remove", text: `${p.code} ${p.label} (${fmtPoints(p.points)})` });
  if (prev.baseScore !== cur.baseScore) out.push({ kind: "change", text: `Điểm gốc ${prev.baseScore} → ${cur.baseScore ?? "—"}` });
  if (prev.cap !== cur.cap) out.push({ kind: "change", text: `Điểm trần ${prev.cap ?? "không"} → ${cur.cap ?? "không"}` });
  if (prev.floor !== cur.floor) out.push({ kind: "change", text: `Điểm sàn ${prev.floor ?? "không"} → ${cur.floor ?? "không"}` });
  if (JSON.stringify(prev.bands) !== JSON.stringify(cur.bands)) out.push({ kind: "change", text: `Xếp loại: ${cur.bands.map((b) => `${b.label} ≥ ${b.min < -999 ? "mọi điểm" : b.min}`).join(", ")}` });
  if (prev.entryDeadlineDays !== cur.entryDeadlineDays) out.push({ kind: "change", text: `Hạn nhập ${prev.entryDeadlineDays} → ${cur.entryDeadlineDays ?? "—"} ngày` });
  return out;
}

/** "Thử tính mẫu" — pick rules (with counts) → conductRepo.simulate (pure). */
function Simulator({ form }: { form: Form }) {
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    const late = form.rules.find((r) => r.attendanceLink === "late");
    const plus = form.rules.find((r) => r.points > 0 && r.points <= 3) ?? form.rules.find((r) => r.points > 0);
    if (late) init[late.id] = 1;
    if (plus) init[plus.id] = 1;
    return init;
  });
  const picked = form.rules.flatMap((r) => Array.from({ length: counts[r.id] ?? 0 }, () => r));
  const res = form.baseScore !== undefined ? conductRepo.simulate({ baseScore: form.baseScore, cap: form.cap, floor: form.floor, bands: form.bands }, picked.map((r) => r.points)) : null;
  const expr = res ? `${form.baseScore} ${picked.map((r) => (r.points < 0 ? `− ${Math.abs(r.points)}` : `+ ${r.points}`)).join(" ")} = ${res.raw}` : "—";
  const step = (id: string, d: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(9, (c[id] ?? 0) + d)) }));
  return (
    <Card>
      <CardHeader title="Thử tính mẫu" icon={<Calculator className="size-5" />} subtitle="Chọn các ghi nhận giả định của một học sinh trong tuần. Không lưu dữ liệu." />
      <div className="space-y-3 px-5 pb-5">
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {form.rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[#f7fbff]">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.label || "(chưa đặt tên)"}</span>
              <span className={clsx("w-10 text-right text-[13px] font-semibold tabular-nums", r.points < 0 ? "text-danger-text" : "text-success-text")}>{fmtPoints(r.points)}</span>
              <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={`Bớt ${r.label}`} onClick={() => step(r.id, -1)} disabled={!counts[r.id]}><Minus className="size-3.5" /></button>
              <span className="w-5 text-center text-sm font-semibold tabular-nums" aria-live="polite">{counts[r.id] ?? 0}</span>
              <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={`Thêm ${r.label}`} onClick={() => step(r.id, 1)}><Plus className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <div className="rounded-xl bg-primary-light px-4 py-3 text-center" aria-live="polite">
          <p className="text-[13px] text-[#0b4c99]">Phép tính</p>
          <p className="text-lg font-extrabold tabular-nums text-ink">{expr}</p>
          {res && <p className="mt-1 text-sm">{res.total !== res.raw ? <>Áp giới hạn trần/sàn → <b>{res.total}</b> · </> : null}Xếp loại: <b>{res.grade}</b></p>}
        </div>
      </div>
    </Card>
  );
}

/** SC30 — rule set editor (drafts only) / read-only view of published or retired versions. */
export function RuleSetEditor({ schoolId, data }: { schoolId: string; data: Data }) {
  const router = useRouter();
  const { can } = useSchool();
  const rs = data.ruleSet;
  const editable = data.canManage;
  const init = useMemo(() => toForm(rs), [rs]);
  const [f, setF] = useState<Form>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dlg, setDlg] = useState<"publish" | "delete" | "copy" | null>(null);
  const [done, setDone] = useState(false);
  const dirty = editable && !done && JSON.stringify(f) !== JSON.stringify(init);
  const base = `/school/${schoolId}/conduct-rules`;
  const onErr = (e: RepoError) => { if (e.code === "VALIDATION") setErrors(e.fieldErrors ?? { form: e.message }); };

  const payload = () => ({ name: f.name, baseScore: f.baseScore ?? NaN, cap: f.cap, floor: f.floor, rules: f.rules.map((r) => ({ ...r, code: r.code.trim().toUpperCase(), label: r.label.trim() })), bands: f.bands, effectiveFrom: f.effectiveFrom ?? "", entryDeadlineDays: f.entryDeadlineDays ?? 0, version: rs.version });
  const save = useCommand((ctx) => conductRepo.saveRuleSetDraft(ctx, schoolId, rs.id, payload()), { success: "Đã lưu bản nháp nội quy", onError: onErr });
  const publish = useCommand(async (ctx) => {
    const saved = dirty ? await conductRepo.saveRuleSetDraft(ctx, schoolId, rs.id, payload()) : rs;
    void saved;
    return conductRepo.publishRuleSet(ctx, schoolId, rs.id);
  }, { success: "Đã ban hành nội quy", onError: onErr, onSuccess: () => { setDone(true); setDlg(null); } });
  const remove = useCommand((ctx) => conductRepo.deleteRuleSetDraft(ctx, schoolId, rs.id), { success: "Đã xóa bản nháp nội quy", onSuccess: () => { setDone(true); router.push(base); } });
  const copy = useCommand((ctx) => conductRepo.newRuleSetVersion(ctx, schoolId, rs.id), { success: (r) => `Đã tạo bản nháp ${r.name}`, onSuccess: (r) => router.push(`${base}/${r.id}`) });
  const saveNow = useCallback(async () => { const r = await save.run(); if (r) setErrors({}); return !!r; }, [save]);
  useUnsavedChanges(dirty, saveNow);

  const setRule = (i: number, patch: Partial<ConductRule>) => setF((x) => ({ ...x, rules: x.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addRule = () => setF((x) => {
    let n = x.rules.length + 1;
    while (x.rules.some((r) => r.id === `rule-${n}` || r.code === `QD${String(n).padStart(2, "0")}`)) n++;
    return { ...x, rules: [...x.rules, { id: `rule-${n}`, code: `QD${String(n).padStart(2, "0")}`, label: "", points: -5, category: "Nề nếp", icon: "alert", shareWithParent: true }] };
  });
  const diff = diffOf(data.previous, f);
  const err = (k: string) => errors[k];
  const inputCls = "input !min-h-9 !py-1 text-[13px]";

  return (
    <div className="page">
      <PageHeader title={rs.name} badge={<><StatusBadge status={rs.status} map={RULESET_STATUS} /><Badge tone="neutral" dot={false}>Bản {rs.versionNo}</Badge></>}
        subtitle={editable ? "Bản nháp — chỉnh sửa, thử tính mẫu, xem thay đổi rồi ban hành." : `Chỉ xem. Hiệu lực ${fmtDate(rs.effectiveFrom)} – ${rs.effectiveTo ? fmtDate(rs.effectiveTo) : "chưa đặt ngày kết thúc"} · ${data.usedBySnapshots} bảng đã chốt dùng bản này.`}
        breadcrumbs={[{ label: "Nội quy thi đua", href: base }, { label: `Bản ${rs.versionNo}` }]}
        actions={editable ? <>
          <Button variant="danger-soft" icon={<Trash2 className="size-4" />} onClick={() => setDlg("delete")}>Xóa bản nháp</Button>
          <Button icon={<Save className="size-4" />} loading={save.pending} onClick={() => saveNow()}>Lưu nháp</Button>
          <Button variant="primary" icon={<Send className="size-4" />} onClick={() => setDlg("publish")}>Ban hành</Button>
        </> : can("rules.manage") ? <Button variant="primary" icon={<Copy className="size-4" />} onClick={() => setDlg("copy")}>Tạo bản mới từ bản này</Button> : undefined} />
      {!editable && <Callout tone="neutral" icon={<Lock />} title="Phiên bản này không sửa trực tiếp">{rs.status === "draft" ? "Bạn không có quyền ban hành nội quy — chỉ xem." : "Nội quy đã ban hành không bị sửa ngầm. Để thay đổi, tạo bản mới có ngày hiệu lực từ hôm nay trở đi."}{rs.publishedAt ? ` Ban hành lúc ${fmtDateTime(rs.publishedAt)}.` : ""}</Callout>}
      <ErrorSummary errors={errors} labels={{ name: "Tên", baseScore: "Điểm gốc", cap: "Điểm trần", floor: "Điểm sàn", effectiveFrom: "Ngày hiệu lực", rules: "Quy định", form: "Biểu mẫu" }} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Cách tính và hiệu lực" icon={<SlidersHorizontal className="size-5" />} />
            {editable ? (
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
              <div className="sm:col-span-2 xl:col-span-3" data-field="name"><TextField label="Tên bộ nội quy" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err("name")} /></div>
              <div data-field="baseScore"><NumberField label="Điểm gốc mỗi tuần" required value={f.baseScore} min={0} max={1000} onChange={(v) => setF({ ...f, baseScore: v })} error={err("baseScore")} /></div>
              <div data-field="cap"><NumberField label="Điểm trần (tùy chọn)" value={f.cap} onChange={(v) => setF({ ...f, cap: v })} error={err("cap")} helper="Để trống nếu không giới hạn" /></div>
              <div data-field="floor"><NumberField label="Điểm sàn (tùy chọn)" value={f.floor} onChange={(v) => setF({ ...f, floor: v })} error={err("floor")} helper="Để trống nếu không giới hạn" /></div>
              <div data-field="effectiveFrom"><DateField label="Ngày bắt đầu hiệu lực" required value={f.effectiveFrom} min={editable ? data.earliestEffective : undefined} onChange={(v) => setF({ ...f, effectiveFrom: v })} error={err("effectiveFrom")} helper={editable ? `Không áp dụng ngược — sớm nhất ${fmtDate(data.earliestEffective)}` : undefined} /></div>
              <div data-field="entryDeadlineDays"><NumberField label="Hạn nhập ghi nhận (ngày)" value={f.entryDeadlineDays} min={0} max={14} allowNegative={false} onChange={(v) => setF({ ...f, entryDeadlineDays: v })} helper="Số ngày sau sự việc giáo viên còn được ghi nhận" /></div>
            </div>
            ) : (
              <dl className="grid gap-x-6 px-5 pb-4 sm:grid-cols-2">
                <InfoRow label="Điểm gốc mỗi tuần">{rs.baseScore}</InfoRow>
                <InfoRow label="Điểm trần / sàn">{rs.cap ?? "Không"} / {rs.floor ?? "Không"}</InfoRow>
                <InfoRow label="Hiệu lực">{fmtDate(rs.effectiveFrom)} – {rs.effectiveTo ? fmtDate(rs.effectiveTo) : "chưa đặt"}</InfoRow>
                <InfoRow label="Hạn nhập ghi nhận">{rs.entryDeadlineDays} ngày</InfoRow>
              </dl>
            )}
          </Card>
          <Card>
            <CardHeader title="Quy định cộng / trừ" icon={<ListChecks className="size-5" />} subtitle="Điểm dương là cộng, âm là trừ. Liên kết điểm danh tự tạo ghi nhận chờ rà soát khi lưu điểm danh." action={editable && <Button size="sm" icon={<Plus className="size-4" />} onClick={addRule}>Thêm quy định</Button>} />
            {err("rules") && <p className="error-text px-5 pb-2">{err("rules")}</p>}
            <div className="table-wrap px-4 pb-4" tabIndex={0} role="region" aria-label="Bảng quy định">
              <table className="table" style={{ minWidth: 900 }}>
                <thead><tr><th>Mã</th><th>Tên quy định</th><th>Nhóm</th><th className="num">Điểm</th><th>Liên kết điểm danh</th><th className="center">Chia sẻ phụ huynh</th>{editable && <th><span className="sr-only">Xóa</span></th>}</tr></thead>
                <tbody>
                  {f.rules.map((r, i) => editable ? (
                    <tr key={r.id} data-field={`rules.${i}.label`}>
                      <td className="w-24"><input className={inputCls} aria-label={`Mã quy định ${i + 1}`} value={r.code} onChange={(e) => setRule(i, { code: e.target.value })} /></td>
                      <td><input className={clsx(inputCls, err(`rules.${i}.label`) && "!border-danger")} aria-label={`Tên quy định ${i + 1}`} value={r.label} onChange={(e) => setRule(i, { label: e.target.value })} aria-invalid={!!err(`rules.${i}.label`) || undefined} />
                        {err(`rules.${i}.label`) && <p className="error-text">{err(`rules.${i}.label`)}</p>}</td>
                      <td className="w-36"><select className={clsx("select", inputCls)} aria-label={`Nhóm quy định ${i + 1}`} value={r.category} onChange={(e) => setRule(i, { category: e.target.value as ConductRule["category"] })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td className="w-24"><input className={clsx(inputCls, "text-right", err(`rules.${i}.points`) && "!border-danger")} inputMode="numeric" aria-label={`Điểm quy định ${i + 1}`} value={Number.isFinite(r.points) ? r.points : ""}
                        onChange={(e) => { const v = e.target.value.trim(); setRule(i, { points: v === "" || v === "-" ? NaN : Number(v), icon: Number(v) > 0 ? "star" : "alert" }); }} />
                        {err(`rules.${i}.points`) && <p className="error-text">{err(`rules.${i}.points`)}</p>}</td>
                      <td className="w-40"><select className={clsx("select", inputCls)} aria-label={`Liên kết điểm danh ${i + 1}`} value={r.attendanceLink ?? ""} onChange={(e) => setRule(i, { attendanceLink: (e.target.value || undefined) as ConductRule["attendanceLink"] })}><option value="">Không</option><option value="late">Đi muộn</option><option value="unexcused">Nghỉ không phép</option></select></td>
                      <td className="center"><input type="checkbox" className="size-4 accent-[var(--color-primary)]" aria-label={`Chia sẻ phụ huynh: ${r.label}`} checked={r.shareWithParent} onChange={(e) => setRule(i, { shareWithParent: e.target.checked })} /></td>
                      <td className="w-10"><button type="button" className="btn btn-ghost btn-icon btn-sm text-danger-text" aria-label={`Xóa quy định ${r.label || i + 1}`} onClick={() => setF({ ...f, rules: f.rules.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button></td>
                    </tr>
                  ) : (
                    <tr key={r.id}>
                      <td className="font-mono text-[12.5px]">{r.code}</td><td className="font-medium text-ink">{r.label}</td><td>{r.category}</td>
                      <td className={clsx("num font-semibold", r.points < 0 ? "text-danger-text" : "text-success-text")}>{fmtPoints(r.points)}</td>
                      <td>{r.attendanceLink === "late" ? "Đi muộn" : r.attendanceLink === "unexcused" ? "Nghỉ không phép" : "—"}</td><td className="center">{r.shareWithParent ? "Có" : "Không"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Xếp loại theo tổng điểm" icon={<ListChecks className="size-5" />} subtitle="Mức thấp nhất áp dụng cho mọi điểm còn lại." />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
              {f.bands.map((b, i) => (
                <div key={i} className="rounded-xl border border-line p-3">
                  <Badge tone={b.tone}>{b.label}</Badge>
                  {editable ? <div className="mt-2 space-y-2">
                    <input className={inputCls} aria-label={`Tên mức ${i + 1}`} value={b.label} onChange={(e) => setF({ ...f, bands: f.bands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    {b.min > -999 ? <label className="flex items-center gap-2 text-[13px] text-body">Từ<input className={clsx(inputCls, "w-20 text-right")} inputMode="numeric" aria-label={`Điểm tối thiểu mức ${b.label}`} value={b.min} onChange={(e) => setF({ ...f, bands: f.bands.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) || 0 } : x)) })} />điểm</label> : <p className="text-[13px] text-muted">Các điểm còn lại</p>}
                  </div> : <p className="mt-2 text-[13px] text-body">{b.min > -999 ? `Từ ${b.min} điểm` : "Các điểm còn lại"}</p>}
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-5">
          <Simulator key={f.rules.map((r) => r.id).join()} form={f} />
          <Card>
            <CardHeader title="Thay đổi so với bản trước" icon={<GitCompare className="size-5" />} subtitle={data.previous ? `So với bản ${data.previous.versionNo} — ${data.previous.name}` : "Không có bản đã ban hành trước đó"} />
            <div className="px-5 pb-5">
              {diff.length ? <ul className="space-y-1.5 text-[13px]">{diff.map((d, i) => (
                <li key={i} className="flex gap-2"><Badge tone={d.kind === "add" ? "success" : d.kind === "remove" ? "danger" : "info"} dot={false}>{d.kind === "add" ? "Thêm" : d.kind === "remove" ? "Bỏ" : "Đổi"}</Badge><span className="min-w-0 text-body">{d.text}</span></li>
              ))}</ul> : <p className="text-sm text-muted">{data.previous ? "Không có khác biệt về quy định và cách tính." : "Đây là bản đầu tiên."}</p>}
            </div>
          </Card>
          <Callout tone="info" icon={<Info />} title="Bảng đã chốt giữ phiên bản của mình">Ban hành bản mới chỉ áp dụng từ ngày hiệu lực. Các tuần đã chốt/công bố trước đó vẫn tính theo phiên bản nội quy tại thời điểm chốt (không tính lại).</Callout>
        </div>
      </div>
      <ConfirmDialog open={dlg === "publish"} onOpenChange={(o) => !o && setDlg(null)} title="Ban hành nội quy" object={`${f.name} — hiệu lực từ ${fmtDate(f.effectiveFrom)}`} confirmLabel="Ban hành" busy={publish.pending}
        error={publish.error && (publish.error.code === "VALIDATION" || publish.error.code === "LOCKED") ? (Object.keys(publish.error.fieldErrors ?? {}).length ? "Có lỗi trong biểu mẫu — xem danh sách lỗi phía trên." : publish.error.message) : undefined}
        consequence={<div className="space-y-1.5"><p>Từ {fmtDate(f.effectiveFrom)}, ghi nhận mới tính theo bản này; bản đang áp dụng kết thúc hiệu lực ngày trước đó.</p><p>Các tuần đã chốt hoặc đã công bố vẫn giữ phiên bản nội quy đã dùng — không tính lại điểm quá khứ.</p>{dirty && <p>Thay đổi chưa lưu sẽ được lưu trước khi ban hành.</p>}{diff.length > 0 && <p>{diff.length} thay đổi so với bản trước.</p>}</div>}
        onConfirm={async () => { await publish.run(); }} />
      <ConfirmDialog open={dlg === "delete"} onOpenChange={(o) => !o && setDlg(null)} title="Xóa bản nháp nội quy" object={rs.name} variant="danger" confirmLabel="Xóa bản nháp" busy={remove.pending}
        consequence="Bản nháp chưa ban hành sẽ bị xóa; các phiên bản đã ban hành không bị ảnh hưởng. Thao tác được ghi nhật ký." onConfirm={async () => { await remove.run(); }} />
      <ConfirmDialog open={dlg === "copy"} onOpenChange={(o) => !o && setDlg(null)} title="Tạo bản mới từ bản này" object={rs.name} confirmLabel="Tạo bản nháp" busy={copy.pending}
        error={copy.error?.code === "VALIDATION" ? copy.error.message : undefined}
        consequence="Tạo bản nháp sao chép từ phiên bản này. Bản đã ban hành giữ nguyên. Mỗi thời điểm chỉ có một bản nháp." onConfirm={async () => { await copy.run(); }} />
      <ConflictDialog error={save.error ?? publish.error} onClose={() => { save.reset(); publish.reset(); }} onReload={() => window.location.reload()} />
    </div>
  );
}
