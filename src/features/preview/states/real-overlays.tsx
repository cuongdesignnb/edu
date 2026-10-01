"use client";
import { useEffect, useState, type ReactNode } from "react";
import { UserCog } from "lucide-react";
import { activitiesRepo, conductRepo, platformRepo, schoolRepo, reportsRepo, sessionRepo, studentsRepo, type RepoError } from "@/lib/repositories/demo-index";
import { useCommand, useRepo, useSession } from "@/lib/query/demo-hooks";
import { setScenario } from "@/lib/demo/scenario";
import type { Actor } from "@/lib/permissions/can";
import { SchoolContextProvider } from "@/components/layout/shells";
import { Button } from "@/components/ui/button";
import { ConflictDialog, useUnsavedChanges } from "@/components/ui/guards";
import { TextField } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { SchoolStatusDialog } from "@/features/platform/school-status-dialog";
import { ClassDrawer } from "@/features/school-org/class-drawer";
import { InviteModal } from "@/features/school-org/invite-modal";
import { AssignDrawer } from "@/features/school-org/assign-drawer";
import { GuardianDialog, VerifyDialog, TransferDialog, IssueAccessDialog, RevokeAccessDialog } from "@/features/students/dialogs";
import { QrImage, LinkBox, accessUrl } from "@/features/students/shared";
import { FileViewerDialog } from "@/features/activities/evidence-dialogs";
import { ExportFormatDialog, exportReportFile, type ExportFormat } from "@/features/reports/viewer";
import { ExplainDrawer } from "@/features/conduct/week-table";
import { InviteAdminDialog } from "@/features/platform/invite-admin-dialog";
import { RequestSupportDialog } from "@/features/platform/support-request-dialog";
import { LessonChangeDrawer } from "@/features/school-ops/lesson-change-drawer";
import { TermDialog } from "@/features/school-org/term-dialog";
import { Modal } from "@/components/ui/dialog";
import { PERSONA_NAMES } from "../data";

const A = "demo-school-a";
const Y = "y-a-2026";
const CLS = "c-a-10a1";
const MINH_ANH = "demo-student-a-001";

export type Need = { kind: "staff"; userId: string } | { kind: "platform"; userId: string } | { kind: "any-staff" };

export function actorMatches(actor: Actor, need: Need) {
  if (need.kind === "any-staff") return actor.kind === "staff" || actor.kind === "platform";
  return actor.kind === need.kind && actor.userId === need.userId;
}

/** Shown instead of the trigger when the real overlay needs another demo persona. */
export function SwitchPersona({ need }: { need: Need }) {
  const { signIn } = useSession();
  if (need.kind === "any-staff") return <Button size="sm" variant="secondary" icon={<UserCog className="size-4" />} onClick={() => signIn({ kind: "staff", userId: "u-lan" })}>Dùng vai trò Cô Lan</Button>;
  return <Button size="sm" variant="secondary" icon={<UserCog className="size-4" />} onClick={() => signIn({ kind: need.kind, userId: need.userId })}>Dùng vai trò {PERSONA_NAMES[need.userId] ?? need.userId}</Button>;
}

type Real = { screen: string; need: Need; hint: string; render: (open: boolean, close: () => void) => ReactNode };

function Loading() { return <div className="p-4"><Skeleton className="h-10" /></div>; }

function O01({ open, close }: { open: boolean; close: () => void }) {
  const list = useRepo(["preview-o01-schools"], (ctx) => platformRepo.listSchools(ctx, { q: "", page: 1, pageSize: 50, filters: { status: "active" } }), { enabled: open });
  const target = list.data?.items.find((s) => s.id !== A && s.id !== "demo-school-b");
  if (!open) return null;
  if (list.isLoading) return <Modal open onOpenChange={close} title="Đang tải trường…"><Loading /></Modal>;
  if (!target) return <Modal open onOpenChange={close} title="Không có trường phù hợp"><p className="text-sm">Không còn trường đang hoạt động (ngoài A/B) để thử tạm dừng. Đặt lại dữ liệu demo ở trang chọn vai trò.</p></Modal>;
  return <SchoolStatusDialog target={{ id: target.id, name: target.name, version:target.version, to: "suspended" }} onClose={close} />;
}

function O10({ open, close }: { open: boolean; close: () => void }) {
  const g = useRepo(["preview-o10", "gd-2"], (ctx) => studentsRepo.guardian(ctx, A, "gd-2"), { enabled: open });
  if (!open) return null;
  const rel = g.data?.relationships[0];
  if (!rel) return <Modal open onOpenChange={close} title="Đang tải quan hệ giám hộ…">{g.error ? <p className="text-sm text-danger-text">{g.error.message}</p> : <Loading />}</Modal>;
  const to = rel.verification === "verified" ? "revoked" : "verified";
  return <VerifyDialog schoolId={A} onClose={close} target={{ relationshipId: rel.id, to, guardianName: g.data!.guardian.fullName, relation: rel.relation, studentName: rel.student.name, activeLinks: rel.links.filter((l) => l.status === "active").length }} />;
}

function StudentDialogs({ which, open, close }: { which: "O09" | "O11"; open: boolean; close: () => void }) {
  const p = useRepo(["preview-student", MINH_ANH], (ctx) => studentsRepo.profile(ctx, A, MINH_ANH), { enabled: open });
  if (!open) return null;
  const s = p.data?.student;
  const cls = p.data?.currentClass;
  if (!s) return <Modal open onOpenChange={close} title="Đang tải học sinh…">{p.error ? <p className="text-sm text-danger-text">{p.error.message}</p> : <Loading />}</Modal>;
  if (which === "O09") return <GuardianDialog open onOpenChange={(o) => !o && close()} schoolId={A} studentId={s.id} studentName={s.fullName} />;
  return <TransferDialog open onOpenChange={(o) => !o && close()} schoolId={A} student={{ id: s.id, fullName: s.fullName, className: cls?.name ?? "—", classId: cls?.id }} canDecide />;
}

function O13({ open, close }: { open: boolean; close: () => void }) {
  const url = accessUrl("binh-minh", "demo-minhanh-me");
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title="Kết quả cấp link / QR" description="Link demo của mẹ Minh Anh — QR mã hóa đúng link này." size="sm"
      footer={<Button variant="primary" onClick={close}>Đóng</Button>}>
      <div className="space-y-3">
        <div className="flex justify-center"><QrImage url={url} /></div>
        <LinkBox url={url} />
        <p className="text-[12.5px] text-muted">Chỉ gửi riêng cho người giám hộ được cấp; không đăng vào nhóm chung. Đây là link demo, không phải token bảo mật.</p>
      </div>
    </Modal>
  );
}

function O14({ open, close }: { open: boolean; close: () => void }) {
  const list = useRepo(["preview-o14"], (ctx) => studentsRepo.accessList(ctx, A, { q: "", page: 1, pageSize: 100, filters: { status: "active" } }), { enabled: open });
  if (!open) return null;
  const row = list.data?.items.find((r) => r.id !== "pa-minhanh-me" && r.id !== "pa-minhanh-bo");
  if (!row) return <Modal open onOpenChange={close} title="Đang tải link…">{list.error ? <p className="text-sm text-danger-text">{list.error.message}</p> : list.isLoading ? <Loading /> : <p className="text-sm">Không còn link đang hoạt động để thử.</p>}</Modal>;
  return <RevokeAccessDialog schoolId={A} onClose={close} target={{ accessId: row.id, label: `${row.relation} ${row.guardianName} — học sinh ${row.studentName} (${row.yearLabel})` }} />;
}

function O28({ open, close }: { open: boolean; close: () => void }) {
  const files = useRepo(["preview-o28"], (ctx) => activitiesRepo.files(ctx, A, Y, CLS), { enabled: open });
  if (!open) return null;
  const f = files.data?.[0];
  if (!f) return <Modal open onOpenChange={close} title="Đang tải tệp lớp…">{files.error ? <p className="text-sm text-danger-text">{files.error.message}</p> : files.isLoading ? <Loading /> : <p className="text-sm">Lớp chưa có tệp.</p>}</Modal>;
  return <FileViewerDialog open onOpenChange={(o) => !o && close()} file={f} meta={[{ label: "Người tải", value: f.ownerName }, { label: "Chia sẻ", value: f.share }]} />;
}

function O30({ open, close }: { open: boolean; close: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const r = useRepo(["preview-o30"], (ctx) => reportsRepo.school(ctx, A, "attendance", {}), { enabled: open });
  if (!open) return null;
  if (!r.data) return <Modal open onOpenChange={close} title="Đang tạo dữ liệu báo cáo…">{r.error ? <p className="text-sm text-danger-text">{r.error.message}</p> : <Loading />}</Modal>;
  const run = async (f: ExportFormat) => {
    if (f === "print") { close(); window.setTimeout(() => window.print(), 50); return; }
    setBusy(true);
    try { const res = await exportReportFile(r.data!, r.data!.title, f); toast.push({ tone: "success", title: "Đã tạo tệp trên trình duyệt", detail: `${res.fileName} · ${res.rowCount} dòng` }); close(); }
    finally { setBusy(false); }
  };
  return <ExportFormatDialog open onOpenChange={(o) => !o && close()} data={r.data} onRun={run} busy={busy} />;
}

/** O19 — real explanation drawer for Minh Anh in the published week-4 snapshot. */
function O19({ open, close }: { open: boolean; close: () => void }) {
  const q = useRepo(["preview-snapshot", "snap-c-a-10a1-w4-v1"], (ctx) => conductRepo.snapshot(ctx, A, Y, CLS, "snap-c-a-10a1-w4-v1"), { enabled: open });
  if (!open) return null;
  const row = q.data?.snapshot.rows.find((r) => r.studentId === MINH_ANH) ?? null;
  if (!q.data || !row) return <Modal open onOpenChange={close} title="Đang tải bản công bố…">{q.error ? <p className="text-sm text-danger-text">{q.error.message}</p> : <Loading />}</Modal>;
  const rs = q.data.ruleSet;
  return <ExplainDrawer row={row} official onClose={close} weekText={`Tuần ${q.data.week.index}`} ruleSet={{ name: rs.name, versionNo: rs.versionNo, baseScore: rs.baseScore, cap: rs.cap, floor: rs.floor, bands: rs.bands }} />;
}

/** O02 — real InviteAdminDialog for school A (platform). */
function O02({ open, close }: { open: boolean; close: () => void }) {
  const q = useRepo(["preview-o02", A], (ctx) => platformRepo.school(ctx, A), { enabled: open });
  if (!open) return null;
  if (!q.data) return <Modal open onOpenChange={close} title="Đang tải trường…">{q.error ? <p className="text-sm text-danger-text">{q.error.message}</p> : <Loading />}</Modal>;
  return <InviteAdminDialog open onClose={close} schoolId={A} schoolName={q.data.school.name} admins={q.data.admins.filter((a) => a.status === "active").map((a) => ({ membershipId: a.membershipId, name: a.name }))} />;
}

/** O04 — real TermDialog for the first term of 2026–2027. */
function O04({ open, close }: { open: boolean; close: () => void }) {
  const q = useRepo(["preview-o04", Y], (ctx) => schoolRepo.yearDetail(ctx, A, Y), { enabled: open });
  if (!open) return null;
  const term = q.data?.terms[0];
  if (!q.data || !term) return <Modal open onOpenChange={close} title="Đang tải năm học…">{q.error ? <p className="text-sm text-danger-text">{q.error.message}</p> : <Loading />}</Modal>;
  return <TermDialog term={{...term, code: "PREVIEW-TERM", version: 1, openingDate: term.openingDate}} year={q.data.year} lockedWeeks={q.data.weeks.filter((w) => w.termId === term.id && w.locked).length} onClose={close} />;
}

/** O32 — the real unsaved-changes guard: type, then click any link. */
export function UnsavedGuardDemo() {
  const [v, setV] = useState("");
  useUnsavedChanges(v.trim().length > 0);
  return (
    <div className="space-y-2">
      <TextField label="Nhập nội dung rồi bấm một liên kết bất kỳ" value={v} onChange={(e) => setV(e.target.value)} helper="Ví dụ bấm tab “Sitemap” ở đầu trang: hộp thoại Ở lại / Bỏ thay đổi hiện ra." />
      {v && <Button size="sm" variant="ghost" onClick={() => setV("")}>Xóa nội dung (hết cảnh báo)</Button>}
    </div>
  );
}

/** O33 — a real version conflict produced by the repository (scenario conflict-next). */
function O33({ open, close }: { open: boolean; close: () => void }) {
  const me = useRepo(["me"], (ctx) => sessionRepo.me(ctx), { enabled: open });
  const [err, setErr] = useState<RepoError | null>(null);
  const [started, setStarted] = useState(false);
  const cmd = useCommand((ctx, version: number, fullName: string, workPhone: string) => sessionRepo.updateProfile(ctx, { fullName, workPhone, version }), { onError: (e) => setErr(e) });
  const u = me.data?.user;
  const { run } = cmd;
  useEffect(() => {
    if (!open) { setStarted(false); return; }
    if (started || !u) return;
    setStarted(true);
    setScenario({ write: "conflict-next" });
    void run(u.version, u.fullName, u.workPhone);
  }, [open, started, u, run]);
  if (!open) return null;
  if (!err) return <Modal open onOpenChange={close} title="Đang gửi lệnh lưu…"><Loading /></Modal>;
  return <ConflictDialog error={err} onClose={() => { setErr(null); close(); }} onReload={() => { setErr(null); void me.refetch(); close(); }} mine={<p className="text-[13px]">Họ tên: {u?.fullName}</p>} />;
}

const inSchool = (node: ReactNode) => <SchoolContextProvider schoolId={A} loading={null}>{() => node}</SchoolContextProvider>;

/** Overlays rendered with the real dialog/drawer built by the owning group. */
export const REAL_OVERLAYS: Record<string, Real> = {
  O01: { screen: "PL02", need: { kind: "platform", userId: "u-bao" }, hint: "SchoolStatusDialog thật — tạm dừng một trường đang hoạt động (không phải A/B). Xác nhận sẽ đổi dữ liệu demo.", render: (open, close) => <O01 open={open} close={close} /> },
  O02: { screen: "PL05", need: { kind: "platform", userId: "u-bao" }, hint: "InviteAdminDialog thật cho trường A — lời mời chỉ mô phỏng, không gửi email.", render: (open, close) => <O02 open={open} close={close} /> },
  O03: { screen: "SC09", need: { kind: "staff", userId: "u-hanh" }, hint: "ClassDrawer thật (tạo lớp năm 2026–2027).", render: (open, close) => open ? inSchool(<ClassDrawer target={{ mode: "create", yearId: Y }} onClose={close} />) : null },
  O04: { screen: "SC06", need: { kind: "staff", userId: "u-hanh" }, hint: "TermDialog thật cho học kỳ I năm 2026–2027 (có kiểm tra tuần đã chốt).", render: (open, close) => open ? inSchool(<O04 open close={close} />) : null },
  O05: { screen: "SC10", need: { kind: "staff", userId: "u-hanh" }, hint: "InviteModal thật — lời mời chỉ mô phỏng, không gửi email.", render: (open, close) => open ? inSchool(<InviteModal open onClose={close} />) : null },
  O06: { screen: "SC12", need: { kind: "staff", userId: "u-hanh" }, hint: "AssignDrawer thật, có xem trước quyền (O07).", render: (open, close) => open ? inSchool(<AssignDrawer prefill={{ kind: "subject", yearId: Y }} onClose={close} />) : null },
  O07: { screen: "SC11", need: { kind: "staff", userId: "u-hanh" }, hint: "Phần “Xem thay đổi quyền” nằm trong AssignDrawer thật — chọn giáo viên, lớp để xem trước.", render: (open, close) => open ? inSchool(<AssignDrawer prefill={{ kind: "homeroom", yearId: Y, classId: "c-a-10a3" }} onClose={close} />) : null },
  O09: { screen: "SC18", need: { kind: "staff", userId: "u-hanh" }, hint: "GuardianDialog thật cho Minh Anh.", render: (open, close) => <StudentDialogs which="O09" open={open} close={close} /> },
  O10: { screen: "SC22", need: { kind: "staff", userId: "u-hanh" }, hint: "VerifyDialog thật với quan hệ giám hộ gd-2.", render: (open, close) => <O10 open={open} close={close} /> },
  O11: { screen: "SC20", need: { kind: "staff", userId: "u-hanh" }, hint: "TransferDialog thật cho Minh Anh — bấm Hủy nếu không muốn đổi dữ liệu.", render: (open, close) => <StudentDialogs which="O11" open={open} close={close} /> },
  O12: { screen: "SC23", need: { kind: "staff", userId: "u-hanh" }, hint: "IssueAccessDialog thật — cấp link riêng, sau đó hiện kết quả O13.", render: (open, close) => <IssueAccessDialog open={open} onOpenChange={(o) => !o && close()} schoolId={A} studentId={MINH_ANH} /> },
  O13: { screen: "SC24", need: { kind: "any-staff" }, hint: "QrImage + LinkBox thật của nhóm học sinh.", render: (open, close) => <O13 open={open} close={close} /> },
  O14: { screen: "SC24", need: { kind: "staff", userId: "u-hanh" }, hint: "RevokeAccessDialog thật — chọn một link đang hoạt động khác link của bố/mẹ Minh Anh.", render: (open, close) => <O14 open={open} close={close} /> },
  O19: { screen: "CL07", need: { kind: "staff", userId: "u-lan" }, hint: "ExplainDrawer thật — giải trình điểm tuần 4 của Minh Anh từ snapshot đã công bố.", render: (open, close) => <O19 open={open} close={close} /> },
  O25: { screen: "SC32", need: { kind: "staff", userId: "u-hanh" }, hint: "LessonChangeDrawer thật — đổi tiết 10A1 tiết 2 ngày 06/10/2026, kiểm tra trùng giáo viên/phòng.", render: (open, close) => <LessonChangeDrawer schoolId={A} today="2026-10-05" target={open ? { classId: CLS, className: "10A1", date: "2026-10-06", period: 2 } : null} onClose={close} /> },
  O28: { screen: "CL24", need: { kind: "staff", userId: "u-lan" }, hint: "FileViewerDialog thật với tệp đầu tiên của lớp 10A1.", render: (open, close) => <O28 open={open} close={close} /> },
  O30: { screen: "SC38", need: { kind: "staff", userId: "u-hanh" }, hint: "ExportFormatDialog thật — tạo CSV/XLSX thật từ báo cáo chuyên cần trường A.", render: (open, close) => <O30 open={open} close={close} /> },
  O34: { screen: "PL08", need: { kind: "platform", userId: "u-bao" }, hint: "RequestSupportDialog thật — nền tảng xin quyền hỗ trợ tạm thời; trường phải cho phép.", render: (open, close) => <RequestSupportDialog open={open} onClose={close} schoolId={A} /> },
  O33: { screen: "AU06", need: { kind: "any-staff" }, hint: "Gửi lệnh lưu hồ sơ thật với kịch bản xung đột một lần → ConflictDialog.", render: (open, close) => <O33 open={open} close={close} /> },
};
