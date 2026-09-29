"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Crown, Users, UserCog, GraduationCap, Link2, RotateCcw, FlaskConical, Clock, ShieldAlert, ArrowRight } from "lucide-react";
import { useRepo, useSession } from "@/lib/query/hooks";
import { parentRepo, resetStore, sessionRepo, makeCtx } from "@/lib/repositories";
import { setScenario, type ReadMode, type WriteMode } from "@/lib/demo/scenario";
import { DEFAULT_DEMO_NOW, demoNowISO, setDemoNow } from "@/lib/demo/clock";
import { writeParentToken, IS_DEMO } from "@/lib/demo/session";
import { fmtDateTime } from "@/lib/formatters";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { RadioGroup } from "@/components/ui/form";
import { useScenario, DemoScenarioBanner } from "@/components/ui/guards";
import { useToast } from "@/components/ui/toast";
import { Brand } from "@/components/layout/brand";
import { EmptyState } from "@/components/ui/states";

interface Persona { userId: string; name: string; role: string; detail: string; icon: React.ReactNode; tone: string; school?: string }

const PERSONAS: { group: string; items: Persona[] }[] = [
  { group: "Vận hành nền tảng", items: [{ userId: "u-bao", name: "Trần Quốc Bảo", role: "Vận hành nền tảng", detail: "Quản lý 8 trường giả định. Không mặc định xem hồ sơ học sinh.", icon: <Crown className="size-4" />, tone: "blue" }] },
  { group: "Trường A — THPT Bình Minh", items: [
    { userId: "u-hanh", name: "Nguyễn Thị Hạnh", role: "Quản trị trường", detail: "Toàn bộ tổ chức trường; không tự sửa bảng thi đua đã công bố.", icon: <UserCog className="size-4" />, tone: "purple", school: "A" },
    { userId: "u-dung", name: "Phạm Quốc Dũng", role: "Ban giám hiệu", detail: "Xem báo cáo, duyệt điều chỉnh sau chốt, thông báo toàn trường.", icon: <UserCog className="size-4" />, tone: "amber", school: "A" },
    { userId: "u-quan", name: "Trần Minh Quân", role: "Giáo vụ", detail: "Hồ sơ học sinh, xếp lớp, nhập dữ liệu, lịch.", icon: <UserCog className="size-4" />, tone: "green", school: "A" },
    { userId: "u-lan", name: "Cô Trần Thị Lan", role: "GVCN 10A1 · Ngữ văn 10A2", detail: "Chủ nhiệm đủ quyền tại 10A1; tại 10A2 chỉ phần Ngữ văn.", icon: <GraduationCap className="size-4" />, tone: "pink", school: "A" },
    { userId: "u-hung", name: "Thầy Nguyễn Văn Hùng", role: "Toán 10A1, 10A2", detail: "Giáo viên bộ môn: không giám hộ, không sơ đồ, không chốt.", icon: <GraduationCap className="size-4" />, tone: "blue", school: "A" },
    { userId: "u-nam", name: "Thầy Hoàng Văn Nam", role: "Vật lý — dạy ở cả trường A và B", detail: "Hai thành viên trường độc lập; chọn trường khi vào.", icon: <Users className="size-4" />, tone: "green", school: "A+B" },
  ] },
  { group: "Trường B — THPT An Hòa", items: [
    { userId: "u-khang", name: "Đỗ Minh Khang", role: "Quản trị trường B", detail: "Có lớp cùng tên 10A1 để kiểm tra dữ liệu không lẫn giữa trường.", icon: <UserCog className="size-4" />, tone: "purple", school: "B" },
    { userId: "u-hoa", name: "Cô Lý Thị Hoa", role: "GVCN 10A1 (trường B)", detail: "Trường B yêu cầu lãnh đạo công bố thi đua.", icon: <GraduationCap className="size-4" />, tone: "amber", school: "B" },
  ] },
];

export default function DemoPage() {
  const { signIn, signOut, session } = useSession();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const scenario = useScenario();
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const links = useRepo(["demo-links"], () => parentRepo.demoLinks());
  const now = demoNowISO();

  if (!IS_DEMO) return <EmptyState title="Chế độ demo đang tắt" description="UI lab và chọn vai trò chỉ bật khi NEXT_PUBLIC_APP_MODE=demo." />;

  const enter = async (p: Persona) => {
    setBusy(p.userId);
    const actor = p.userId === "u-bao" ? { kind: "platform" as const, userId: p.userId } : { kind: "staff" as const, userId: p.userId };
    signIn(actor, "demo");
    if (actor.kind === "platform") { router.push("/platform"); return; }
    const me = await sessionRepo.me(makeCtx(actor));
    const live = me.workspaces.filter((w) => w.membershipStatus === "active" && (w.schoolWorkspace || w.teacherWorkspace));
    if (live.length === 1) router.push(live[0].schoolWorkspace ? `/school/${live[0].school.id}` : `/teacher/${live[0].school.id}`);
    else router.push("/choose-school");
  };

  const openLink = (slug: string, token: string) => {
    writeParentToken(slug, null);
    window.open(`/p/${slug}/access?t=${encodeURIComponent(token)}`, "_blank", "noopener");
  };

  return (
    <div className="min-h-dvh bg-app">
      <DemoScenarioBanner />
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <header className="flex flex-wrap items-center gap-4">
          <Brand />
          <Badge tone="warning" icon={<FlaskConical className="size-3.5" />}>Nội bộ demo</Badge>
          <nav className="ml-auto flex flex-wrap gap-2 text-sm" aria-label="UI lab">
            {[["/preview/flows", "Luồng demo"], ["/preview/sitemap", "Sitemap"], ["/preview/checklist", "Checklist"], ["/preview/components", "Component"], ["/preview/states", "Trạng thái"], ["/preview/references", "Ảnh tham chiếu"]].map(([h, l]) => (
              <Link key={h} href={h} className="chip hover:bg-primary-light">{l}</Link>
            ))}
          </nav>
        </header>
        <div>
          <h1 className="page-title">Chọn vai trò và kịch bản demo</h1>
          <p className="page-subtitle mt-1">Trang này chỉ dành cho người duyệt bản demo, không thuộc menu sản phẩm.</p>
        </div>
        <Callout tone="warning" icon={<ShieldAlert />} title="Đây không phải đăng nhập bảo mật">
          Chọn vai trò chỉ đổi ngữ cảnh mô phỏng trên trình duyệt này. Toàn bộ dữ liệu là giả định, lưu cục bộ (IndexedDB), chưa có backend, chưa có xác thực hay phân quyền bảo mật thật.
          {session && <> Phiên hiện tại: <b>{session.actor.kind === "platform" ? "Vận hành nền tảng" : session.actor.kind === "staff" ? session.actor.userId : "—"}</b>. <button type="button" className="underline" onClick={() => signOut()}>Thoát phiên</button></>}
        </Callout>

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            {PERSONAS.map((g) => (
              <Card key={g.group}>
                <CardHeader title={g.group} icon={<Building2 className="size-5" />} />
                <ul className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
                  {g.items.map((p) => (
                    <li key={p.userId}>
                      <button type="button" onClick={() => enter(p)} disabled={!!busy}
                        className="flex h-full w-full items-start gap-3 rounded-xl border border-line bg-white p-3.5 text-left transition-colors hover:border-[#9cc7f5] hover:bg-[#f7fbff] disabled:opacity-60">
                        <Avatar name={p.name} tone={p.tone} size={42} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[15px] font-bold text-ink">{p.name}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-primary-strong">{p.icon}{p.role}</span>
                          <span className="mt-1 block text-[12.5px] text-muted">{p.detail}</span>
                        </span>
                        <ArrowRight className="mt-1 size-4 flex-none text-muted" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            <Card>
              <CardHeader title="Link tra cứu phụ huynh (demo)" icon={<Link2 className="size-5" />} subtitle="Phụ huynh không có tài khoản. Mỗi link = một học sinh × một trường × một năm học. Mở trong tab mới." />
              <div className="table-wrap px-5 pb-5">
                <table className="table" style={{ minWidth: 640 }}>
                  <thead><tr><th>Học sinh</th><th>Người nhận</th><th>Trường</th><th>Năm</th><th>Trạng thái</th><th /></tr></thead>
                  <tbody>
                    {links.data?.map((l) => (
                      <tr key={l.id}>
                        <td className="font-semibold text-ink">{l.studentName}</td>
                        <td>{l.relation}{l.modules < 8 ? <span className="ml-1 text-[12px] text-muted">({l.modules} mục)</span> : null}</td>
                        <td>{l.schoolName}</td><td>{l.yearLabel}</td>
                        <td><Badge tone={PUBLICATION_STATUS[l.status].tone}>{PUBLICATION_STATUS[l.status].label}</Badge></td>
                        <td className="text-right"><Button size="sm" variant="secondary" onClick={() => openLink(l.slug, l.token)}>Mở link</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Kịch bản lỗi (xác định trước)" icon={<FlaskConical className="size-5" />} />
              <div className="space-y-4 px-5 pb-5">
                <RadioGroup<WriteMode> label="Khi lưu dữ liệu" value={scenario.write} onChange={(v) => setScenario({ write: v })} options={[
                  { value: "normal", label: "Bình thường" },
                  { value: "fail-next", label: "Lần lưu kế tiếp lỗi mạng", description: "Không báo thành công, giữ nội dung, thử lại được." },
                  { value: "offline", label: "Mất mạng liên tục", description: "Mọi thao tác lưu đều thất bại cho tới khi tắt." },
                  { value: "conflict-next", label: "Lần lưu kế tiếp xung đột phiên bản" },
                ]} />
                <RadioGroup<ReadMode> label="Khi tải dữ liệu" value={scenario.read} onChange={(v) => setScenario({ read: v })} options={[
                  { value: "normal", label: "Bình thường" }, { value: "error-next", label: "Lần tải kế tiếp lỗi" }, { value: "slow", label: "Mạng chậm (xem skeleton)" },
                ]} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Đồng hồ demo" icon={<Clock className="size-5" />} subtitle={`Hiện tại: ${fmtDateTime(now)}`} />
              <div className="flex flex-wrap gap-2 px-5 pb-5">
                {[[DEFAULT_DEMO_NOW, "Thứ Hai 05/10 08:00 (mặc định)"], ["2026-10-10T17:00:00+07:00", "Thứ Bảy 10/10 17:00"], ["2026-10-12T08:00:00+07:00", "Thứ Hai 12/10 08:00 (tuần sau)"]].map(([iso, label]) => (
                  <Button key={iso} size="sm" variant={now === iso ? "primary" : "secondary"} onClick={() => { setDemoNow(iso === DEFAULT_DEMO_NOW ? null : iso); qc.clear(); toast.push({ tone: "info", title: "Đã đổi đồng hồ demo", detail: label }); router.refresh(); }}>{label}</Button>
                ))}
                <p className="w-full text-[12.5px] text-muted">Dùng để mô phỏng “đặt lịch công bố”. Không có máy chủ chạy nền — khi đóng trình duyệt sẽ không có gì tự công bố.</p>
              </div>
            </Card>
            <Card>
              <CardHeader title="Dữ liệu demo" icon={<RotateCcw className="size-5" />} />
              <div className="space-y-3 px-5 pb-5 text-sm text-body">
                <p>Đặt lại toàn bộ dữ liệu về bộ mẫu ban đầu (8 trường, 153 học sinh giả định). Các tab khác cùng trình duyệt sẽ cập nhật.</p>
                <Button variant="danger-soft" icon={<RotateCcw className="size-4" />} onClick={() => setResetOpen(true)}>Đặt lại dữ liệu demo</Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
      <ConfirmDialog open={resetOpen} onOpenChange={setResetOpen} title="Đặt lại dữ liệu demo?" object="Toàn bộ dữ liệu demo trên trình duyệt này" variant="danger"
        consequence="Mọi thay đổi bạn đã thao tác (lớp, ghi nhận, link…) sẽ bị thay bằng bộ dữ liệu mẫu ban đầu. Thao tác chỉ ảnh hưởng trình duyệt này." confirmLabel="Đặt lại" busy={busy === "reset"}
        onConfirm={async () => { setBusy("reset"); await resetStore(); qc.clear(); setBusy(null); setResetOpen(false); toast.push({ tone: "success", title: "Đã đặt lại dữ liệu demo" }); }} />
    </div>
  );
}
