"use client";
import { useState } from "react";
import Link from "next/link";
import { PanelsTopLeft, Info, CheckCircle2 } from "lucide-react";
import { useSession } from "@/lib/query/demo-hooks";
import { registryById } from "@/lib/routing/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { BottomSheet, ConfirmDialog, Drawer, Modal } from "@/components/ui/dialog";
import { Checkbox, DateField, ErrorSummary, NumberField, SelectField, TextArea, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { OVERLAYS } from "../data";
import { OVERLAY_SPECS, type OverlaySpec } from "./overlay-specs";
import { REAL_OVERLAYS, SwitchPersona, UnsavedGuardDemo, actorMatches } from "./real-overlays";

type Values = Record<string, string | number | boolean | undefined>;

/** "Mẫu tương đương": validates like the real one but never writes; points to the real route. */
function EquivalentDialog({ id, title, spec, open, onClose }: { id: string; title: string; spec: OverlaySpec; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const route = registryById(spec.screen);
  const close = () => { setV({}); setErrors({}); setChecked(false); onClose(); };
  const labels = Object.fromEntries(spec.fields.map((f) => [f.key, f.label]));

  if (spec.container === "confirm" && spec.confirm) {
    return (
      <ConfirmDialog open={open} onOpenChange={(o) => !o && close()} title={title} object={spec.confirm.object} consequence={spec.confirm.consequence}
        confirmLabel={spec.confirm.label} variant={spec.danger ? "danger" : "primary"} reasonRequired={spec.confirm.reason} reasonLabel={spec.confirm.reason ? "Lý do" : undefined}
        onConfirm={() => { close(); toast.push({ tone: "info", title: "Mẫu tương đương — không có dữ liệu nào thay đổi", detail: `Thao tác thật ở ${route?.id} — ${route?.title}.` }); }}>
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] text-warning-text">Mẫu tương đương trong trang nội bộ. Thao tác thật: <Link href={route?.href ?? "/"} className="font-semibold underline">{route?.id} — {route?.title}</Link></p>
      </ConfirmDialog>
    );
  }

  const check = () => {
    const e: Record<string, string> = {};
    for (const f of spec.fields) {
      const val = v[f.key];
      if (f.required && f.type !== "readonly" && (val === undefined || val === "" || val === false)) e[f.key] = f.type === "checkbox" ? "Cần xác nhận" : "Bắt buộc nhập";
      if (f.type === "email" && typeof val === "string" && val && !/^[^@\s]+@[^@\s]+\.test$/.test(val)) e[f.key] = "Dùng email demo có đuôi .test";
    }
    setErrors(e);
    setChecked(Object.keys(e).length === 0);
  };
  const body = (
    <div className="space-y-4">
      <p className="rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] text-warning-text">
        Mẫu tương đương (hộp thoại thật nằm trong không gian lớp/trường): biểu mẫu kiểm tra hợp lệ nhưng <b>không ghi dữ liệu</b>. Thao tác thật: <Link href={route?.href ?? "/"} className="font-semibold underline">{route?.id} — {route?.title}</Link>
      </p>
      <ErrorSummary errors={errors} labels={labels} />
      {spec.fields.map((f) => {
        const common = { label: f.label, required: f.required, error: errors[f.key] };
        return (
          <div key={f.key} data-field={f.key}>
            {f.type === "readonly" ? <TextField {...common} value={f.value ?? ""} readOnly />
              : f.type === "select" ? <SelectField {...common} value={(v[f.key] as string) ?? ""} placeholder="Chọn…" options={(f.options ?? []).map((o) => ({ value: o, label: o }))} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                : f.type === "date" ? <DateField {...common} value={v[f.key] as string | undefined} onChange={(iso) => setV({ ...v, [f.key]: iso })} />
                  : f.type === "number" ? <NumberField {...common} value={v[f.key] as number | undefined} onChange={(n) => setV({ ...v, [f.key]: n })} />
                    : f.type === "textarea" ? <TextArea {...common} rows={3} value={(v[f.key] as string) ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                      : f.type === "checkbox" ? <><Checkbox label={f.label} checked={!!v[f.key]} onChange={(b) => setV({ ...v, [f.key]: b })} />{errors[f.key] && <p className="error-text mt-1">{errors[f.key]}</p>}</>
                        : <TextField {...common} type={f.type === "email" ? "email" : "text"} value={(v[f.key] as string) ?? ""} helper={f.helper} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
          </div>
        );
      })}
      {spec.note && <p className="flex gap-2 text-[12.5px] text-muted"><Info className="mt-0.5 size-3.5 flex-none" aria-hidden />{spec.note}</p>}
      {checked && <p className="flex items-center gap-2 rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success-text" role="status"><CheckCircle2 className="size-4" aria-hidden />Biểu mẫu hợp lệ. Mẫu này không lưu — hãy thực hiện ở route thật để ghi dữ liệu.</p>}
    </div>
  );
  const footer = <><Button variant="ghost" onClick={close}>Hủy</Button><Button variant="primary" onClick={check}>Kiểm tra biểu mẫu</Button></>;
  const props = { open, onOpenChange: (o: boolean) => { if (!o) close(); }, title, description: `${id} · mẫu tương đương`, footer };
  if (spec.container === "drawer") return <Drawer {...props}>{body}</Drawer>;
  if (spec.container === "sheet") return <BottomSheet {...props}>{body}</BottomSheet>;
  return <Modal {...props}>{body}</Modal>;
}

function OverlayCard({ o }: { o: (typeof OVERLAYS)[number] }) {
  const [open, setOpen] = useState(false);
  const { actor } = useSession();
  const real = REAL_OVERLAYS[o.id];
  const spec = OVERLAY_SPECS[o.id];
  const ok = real ? actorMatches(actor, real.need) : true;
  const isGuard = o.id === "O32";
  return (
    <li id={o.id} className="flex scroll-mt-4 flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info" dot={false}>{o.id}</Badge>
        <p className="text-[14px] font-bold text-ink">{o.title}</p>
        {real || isGuard ? <Badge tone="success">Thành phần thật</Badge> : <Badge tone="neutral">Mẫu tương đương</Badge>}
      </div>
      <p className="text-[12.5px] text-muted"><b className="text-body">Trường dữ liệu:</b> {o.fields}</p>
      <p className="text-[12.5px] text-muted"><b className="text-body">Điều kiện:</b> {o.acceptance}</p>
      {real && <p className="text-[12.5px] text-body">{real.hint}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {isGuard ? <UnsavedGuardDemo /> : ok ? <Button size="sm" variant="secondary" icon={<PanelsTopLeft className="size-4" />} onClick={() => setOpen(true)}>Mở {o.id}</Button> : <SwitchPersona need={real!.need} />}
        {(real?.screen ?? spec?.screen) && <Link href={registryById((real?.screen ?? spec?.screen)!)?.href ?? "/"} className="text-[12.5px] font-semibold text-primary-strong hover:underline">Nơi dùng thật: {real?.screen ?? spec?.screen}</Link>}
      </div>
      {real ? real.render(open, () => setOpen(false)) : spec ? <EquivalentDialog id={o.id} title={o.title} spec={spec} open={open} onClose={() => setOpen(false)} /> : null}
    </li>
  );
}

export function OverlayGrid() {
  const realCount = OVERLAYS.filter((o) => REAL_OVERLAYS[o.id] || o.id === "O32").length;
  return (
    <div className="space-y-3">
      <Callout tone="info" icon={<Info />} title={`${realCount}/${OVERLAYS.length} overlay dùng thành phần thật`}>
        “Thành phần thật” mở đúng hộp thoại/drawer do nhóm sở hữu dựng, chạy lệnh thật trên repository mock (có thể đổi dữ liệu demo — dùng Hủy nếu chỉ xem). “Mẫu tương đương” dùng Modal/Drawer/ConfirmDialog dùng chung với trường dữ liệu theo docs/02, kiểm tra hợp lệ nhưng không ghi dữ liệu và dẫn tới route chứa hộp thoại thật.
      </Callout>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {OVERLAYS.map((o) => <OverlayCard key={o.id} o={o} />)}
      </ul>
    </div>
  );
}

export const REAL_OVERLAY_IDS = [...Object.keys(REAL_OVERLAYS), "O32"];
