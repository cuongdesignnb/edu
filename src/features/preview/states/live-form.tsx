"use client";
import { useCallback, useEffect, useState } from "react";
import { Save, RefreshCw, Undo2, CheckCircle2, WifiOff, UserRound } from "lucide-react";
import { sessionRepo, type RepoError } from "@/lib/repositories";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import { fmtDateTime } from "@/lib/formatters";
import { demoNowISO } from "@/lib/demo/clock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/card";
import { ErrorSummary, TextField, TextArea } from "@/components/ui/form";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { ErrorState, PageSkeleton } from "@/components/ui/states";

type Form = { fullName: string; workPhone: string; bio: string };
const LABELS = { fullName: "Họ tên", workPhone: "Số liên hệ công việc" };

/**
 * Live demo for ST05/ST06/ST07/ST08/ST20 + O32/O33: edits the current staff user's own
 * profile through the real repository command (sessionRepo.updateProfile). Nothing is faked:
 * the scenario chosen above decides whether the write fails, conflicts or succeeds.
 */
export function LiveSaveDemo() {
  const { actor } = useSession();
  const me = useRepo(["me"], (ctx) => sessionRepo.me(ctx), { enabled: actor.kind !== "anonymous" });
  const [form, setForm] = useState<Form | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [lastFail, setLastFail] = useState<RepoError | null>(null);
  const [conflict, setConflict] = useState<RepoError | null>(null);
  const user = me.data?.user;
  const initial: Form | null = user ? { fullName: user.fullName, workPhone: user.workPhone ?? "", bio: user.bio ?? "" } : null;
  // Reset the form only when the stored record itself changes (id/version), so a reload keeps the draft.
  useEffect(() => { if (user) setForm({ fullName: user.fullName, workPhone: user.workPhone ?? "", bio: user.bio ?? "" }); }, [user?.id, user?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!form && !!initial && (form.fullName !== initial.fullName || form.workPhone !== initial.workPhone || form.bio !== initial.bio);

  const cmd = useCommand((ctx, f: Form, version: number) => sessionRepo.updateProfile(ctx, { fullName: f.fullName, workPhone: f.workPhone, bio: f.bio, version }), {
    success: "Đã lưu hồ sơ (dữ liệu demo cục bộ)",
    onError: (e) => { setLastFail(e); if (e.code === "CONFLICT") setConflict(e); },
    onSuccess: () => { setLastFail(null); setLastSaved(demoNowISO()); },
  });
  const save = useCallback(async () => {
    if (!form || !user) return false;
    const r = await cmd.run(form, user.version);
    return !!r;
  }, [cmd, form, user]);
  useUnsavedChanges(dirty, save);

  if (actor.kind === "anonymous") return <Callout tone="warning" icon={<UserRound />} title="Cần một vai trò nhân sự demo">Chọn vai trò ở thanh phía trên (ví dụ Cô Lan) để thử lưu thật qua repository mock.</Callout>;
  if (me.isLoading) return <div className="rounded-xl border border-line"><PageSkeleton variant="form" /></div>;
  if (me.error) return <div className="rounded-xl border border-line"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;
  if (!form || !user) return null;
  const fe = cmd.error?.code === "VALIDATION" ? cmd.error.fieldErrors ?? {} : {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-muted">Bản ghi: hồ sơ của <b className="text-ink">{user.fullName}</b> · phiên bản {user.version}</span>
        {cmd.pending && <Badge tone="info">Đang lưu… (ST06)</Badge>}
        {!cmd.pending && lastFail?.code === "NETWORK" && <Badge tone="danger" icon={<WifiOff className="size-3.5" />}>Chưa lưu được — nội dung vẫn giữ (ST05)</Badge>}
        {!cmd.pending && !lastFail && lastSaved && !dirty && <Badge tone="success" icon={<CheckCircle2 className="size-3.5" />}>Đã lưu cục bộ (mô phỏng) lúc {fmtDateTime(lastSaved)} (ST07)</Badge>}
        {dirty && <Badge tone="warning">Có thay đổi chưa lưu</Badge>}
      </div>
      <ErrorSummary errors={fe} labels={LABELS} />
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <div data-field="fullName"><TextField label="Họ tên" required value={form.fullName} error={fe.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} helper="Nhập dưới 3 ký tự để xem lỗi form (ST08)" /></div>
        <div data-field="workPhone"><TextField label="Số liên hệ công việc" required value={form.workPhone} error={fe.workPhone} onChange={(e) => setForm({ ...form, workPhone: e.target.value })} /></div>
        <div className="md:col-span-2"><TextArea label="Giới thiệu ngắn" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxChars={200} /></div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="submit" variant="primary" loading={cmd.pending} icon={<Save className="size-4" />} disabled={!dirty && !lastFail}>Lưu thay đổi</Button>
          <Button variant="ghost" icon={<Undo2 className="size-4" />} disabled={!dirty || cmd.pending} onClick={() => { setForm(initial); cmd.reset(); setLastFail(null); }}>Hủy thay đổi</Button>
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} disabled={cmd.pending} onClick={() => me.refetch()}>Tải lại dữ liệu (ST01/ST04)</Button>
        </div>
      </form>
      <p className="text-[12.5px] text-muted">Khi có thay đổi chưa lưu, bấm vào một liên kết (ví dụ tab “Luồng demo” ở trên) để thấy hộp thoại O32. Nút lưu bị khóa khi đang lưu nên không thể gửi hai lần.</p>
      <ConflictDialog error={conflict} onClose={() => setConflict(null)} onReload={() => { setConflict(null); cmd.reset(); setLastFail(null); void me.refetch().then((r) => { const u = r.data?.user; if (u) setForm({ fullName: u.fullName, workPhone: u.workPhone ?? "", bio: u.bio ?? "" }); }); }}
        mine={<dl className="grid grid-cols-[auto_1fr] gap-x-3 text-[13px]"><dt className="text-muted">Họ tên</dt><dd>{form.fullName}</dd><dt className="text-muted">Số liên hệ</dt><dd>{form.workPhone}</dd></dl>} />
    </div>
  );
}
