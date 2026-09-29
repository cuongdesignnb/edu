"use client";
import { FlaskConical, Activity, PanelsTopLeft, Save, UserCog } from "lucide-react";
import { setScenario, type ReadMode, type WriteMode } from "@/lib/demo/scenario";
import { useSession } from "@/lib/query/hooks";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/form";
import { useScenario } from "@/components/ui/guards";
import { PERSONA_NAMES, STATES, OVERLAYS } from "../data";
import { STATE_EXAMPLES } from "./examples";
import { LiveSaveDemo } from "./live-form";
import { OverlayGrid } from "./overlays";

function PersonaBar() {
  const { session, signIn, signOut } = useSession();
  const cur = session?.actor.kind === "staff" || session?.actor.kind === "platform" ? session.actor.userId : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-[13px]">
      <UserCog className="size-4 text-primary" aria-hidden />
      <span className="text-muted">Vai trò demo hiện tại:</span>
      <b className="text-ink">{cur ? PERSONA_NAMES[cur] ?? cur : "chưa chọn"}</b>
      <span className="ml-auto flex flex-wrap gap-2">
        {(["u-lan", "u-hanh", "u-dung"] as const).map((u) => <Button key={u} size="sm" variant={cur === u ? "primary" : "secondary"} onClick={() => signIn({ kind: "staff", userId: u })}>{PERSONA_NAMES[u].split(" — ")[0]}</Button>)}
        <Button size="sm" variant={cur === "u-bao" ? "primary" : "secondary"} onClick={() => signIn({ kind: "platform", userId: "u-bao" })}>Vận hành</Button>
        {cur && <Button size="sm" variant="ghost" onClick={() => signOut()}>Thoát phiên</Button>}
      </span>
    </div>
  );
}

/** DV06 — states ST01–ST28, overlays O01–O34 and deterministic scenario controls. */
export function StatesLab() {
  const scenario = useScenario();
  return (
    <div className="page">
      <PageHeader title="Trạng thái và tương tác" subtitle={`${STATES.length} trạng thái và ${OVERLAYS.length} overlay, chạy trên component dùng chung và repository mock. Kịch bản lỗi được xác định trước, không ngẫu nhiên.`} />
      <PersonaBar />
      <nav aria-label="Mục trong trang" className="flex flex-wrap gap-2">
        <a href="#scenario" className="chip hover:bg-primary-light">Kịch bản & thử lưu</a>
        <a href="#states" className="chip hover:bg-primary-light">ST01–ST28</a>
        <a href="#overlays" className="chip hover:bg-primary-light">O01–O34</a>
      </nav>

      <div id="scenario" className="grid scroll-mt-4 grid-cols-1 gap-5 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title="Kịch bản mô phỏng" icon={<FlaskConical className="size-5" />} />
          <div className="space-y-4 px-5 pb-5">
            <RadioGroup<WriteMode> label="Khi lưu dữ liệu" value={scenario.write} onChange={(v) => setScenario({ write: v })} options={[
              { value: "normal", label: "Bình thường" },
              { value: "fail-next", label: "Lần lưu kế tiếp lỗi mạng", description: "ST05 — không báo thành công, giữ nội dung." },
              { value: "offline", label: "Mất mạng liên tục", description: "Mọi lần lưu thất bại tới khi tắt." },
              { value: "conflict-next", label: "Lần lưu kế tiếp xung đột phiên bản", description: "ST20 / O33." },
            ]} />
            <RadioGroup<ReadMode> label="Khi tải dữ liệu" value={scenario.read} onChange={(v) => setScenario({ read: v })} options={[
              { value: "normal", label: "Bình thường" },
              { value: "error-next", label: "Lần tải kế tiếp lỗi", description: "ST04 — bấm “Tải lại dữ liệu”." },
              { value: "slow", label: "Mạng chậm", description: "ST01 — skeleton giữ bố cục." },
            ]} />
          </div>
        </Card>
        <Card id="live" className="scroll-mt-4">
          <CardHeader title="Thử lưu thật qua repository" icon={<Save className="size-5" />} subtitle="Sửa hồ sơ của chính vai trò đang chọn bằng sessionRepo.updateProfile. Kết quả phụ thuộc kịch bản bên trái — không có thành công giả." />
          <div className="px-5 pb-5"><LiveSaveDemo /></div>
        </Card>
      </div>

      <Card id="states" className="scroll-mt-4">
        <CardHeader title={`Trạng thái toàn hệ thống (${STATES.length})`} icon={<Activity className="size-5" />} />
        <ul className="grid grid-cols-1 gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
          {STATES.map((s) => (
            <li key={s.id} id={s.id} className="flex scroll-mt-4 flex-col gap-2 rounded-xl border border-line bg-[#fbfdff] p-3.5">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="info" dot={false}>{s.id}</Badge><p className="text-[14px] font-bold text-ink">{s.title}</p></div>
              <p className="text-[12.5px] text-muted">{s.acceptance}</p>
              <div className="min-w-0">{STATE_EXAMPLES[s.id]?.()}</div>
            </li>
          ))}
        </ul>
      </Card>

      <Card id="overlays" className="scroll-mt-4">
        <CardHeader title={`Overlay, drawer, sheet và form (${OVERLAYS.length})`} icon={<PanelsTopLeft className="size-5" />} />
        <div className="px-5 pb-5"><OverlayGrid /></div>
      </Card>
    </div>
  );
}
