"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Eye, CheckCircle2, FileEdit, Archive, Info, Camera } from "lucide-react";
import { conductRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { DataTable, type Column } from "@/components/data/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/form";
import { ActionMenu } from "@/components/ui/menu";
import { EmptyState, QueryState } from "@/components/ui/states";
import { StatTile } from "./ui";

type Data = Awaited<ReturnType<typeof conductRepo.ruleSets>>;
type Row = Data["items"][number];

export const RULESET_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "info" }> = {
  draft: { label: "Nháp", tone: "neutral" }, published: { label: "Đã ban hành", tone: "success" }, retired: { label: "Ngừng áp dụng", tone: "neutral" },
};

/** SC29 — rule set versions: status, effective range, current marker, snapshots using each version; O22 new version. */
export function RuleSetList({ schoolId }: { schoolId: string }) {
  const q = useRepo(["rule-sets", schoolId], (c) => conductRepo.ruleSets(c, schoolId));
  const router = useRouter();
  const base = `/school/${schoolId}/conduct-rules`;
  const [create, setCreate] = useState(false);
  const [from, setFrom] = useState("");
  const newCmd = useCommand((ctx, fromId: string) => conductRepo.newRuleSetVersion(ctx, schoolId, fromId), { success: (r) => `Đã tạo bản nháp ${r.name}`, onSuccess: (r) => { setCreate(false); router.push(`${base}/${r.id}`); } });
  return (
    <QueryState query={q} skeleton="table">
      {(d) => {
        const draft = d.items.find((r) => r.status === "draft");
        const current = d.items.find((r) => r.isCurrent);
        const upcoming = d.items.filter((r) => r.status === "published" && current && r.effectiveFrom > (current.effectiveFrom ?? "")).length;
        const columns: Column<Row>[] = [
          { key: "name", header: "Bộ nội quy", cell: (r) => <div className="min-w-[220px]"><p className="font-semibold text-ink">{r.name}</p><p className="text-[12.5px] text-muted">Bản {r.versionNo} · {r.rules.length} quy định · điểm gốc {r.baseScore}</p></div> },
          { key: "status", header: "Trạng thái", cell: (r) => <div className="flex flex-wrap gap-1.5"><StatusBadge status={r.status} map={RULESET_STATUS} />{r.isCurrent && <Badge tone="info">Đang áp dụng hôm nay</Badge>}</div> },
          { key: "range", header: "Hiệu lực", cell: (r) => <span className="whitespace-nowrap text-[13px]">{fmtDate(r.effectiveFrom)} – {r.effectiveTo ? fmtDate(r.effectiveTo) : "chưa đặt ngày kết thúc"}</span> },
          { key: "snap", header: "Bảng đã chốt dùng bản này", align: "right", hideBelow: "md", cell: (r) => <span className="tabular-nums">{r.usedBySnapshots}</span> },
          { key: "by", header: "Người tạo · ban hành", hideBelow: "lg", cell: (r) => <div className="text-[13px]"><p>{r.createdByName}</p><p className="text-muted">{r.publishedAt ? `Ban hành ${fmtDateTime(r.publishedAt)}` : "Chưa ban hành"}</p></div> },
          { key: "act", header: <span className="sr-only">Thao tác</span>, cell: (r) => <ActionMenu label={`Thao tác với ${r.name}`} items={[
            { label: r.status === "draft" && d.canManage ? "Mở để soạn" : "Xem chi tiết", icon: r.status === "draft" ? <FileEdit /> : <Eye />, href: `${base}/${r.id}` },
            ...(d.canManage && r.status !== "draft" ? [{ label: "Tạo bản mới từ bản này", icon: <Plus />, disabled: !!draft, hint: draft ? "Đang có một bản nháp" : undefined, onSelect: () => { setFrom(r.id); setCreate(true); } }] : []),
          ]} /> },
        ];
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile label="Đang áp dụng hôm nay" value={current ? `Bản ${current.versionNo}` : "—"} hint={current?.name} icon={<CheckCircle2 className="size-5" />} tone="green" />
              <StatTile label="Bản đã ban hành sắp hiệu lực" value={upcoming} icon={<ClipboardList className="size-5" />} tone="blue" />
              <StatTile label="Bản nháp" value={draft ? 1 : 0} hint={draft ? `Hiệu lực dự kiến ${fmtDate(draft.effectiveFrom)}` : "Không có"} icon={<FileEdit className="size-5" />} tone="amber" />
              <StatTile label="Bảng đã chốt giữ phiên bản" value={d.items.reduce((a, r) => a + r.usedBySnapshots, 0)} icon={<Camera className="size-5" />} tone="purple" />
            </div>
            <Card>
              <CardHeader title="Các phiên bản nội quy" icon={<ClipboardList className="size-5" />}
                action={d.canManage && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setFrom(current?.id ?? d.items.find((r) => r.status !== "draft")?.id ?? ""); setCreate(true); }} disabled={!!draft} title={draft ? "Hoàn tất hoặc xóa bản nháp hiện có trước" : undefined}>Tạo bản mới</Button>} />
              {draft && d.canManage && <div className="px-5 pb-3"><Callout tone="warning" icon={<Info />} action={<Button size="sm" onClick={() => router.push(`${base}/${draft.id}`)}>Mở bản nháp</Button>}>Đang có bản nháp “{draft.name}”. Mỗi thời điểm chỉ có một bản nháp — hoàn tất ban hành hoặc xóa bản nháp trước khi tạo bản mới.</Callout></div>}
              <div className="px-4 pb-2">
                <DataTable caption="Phiên bản nội quy" rows={d.items} columns={columns} rowKey={(r) => r.id} minWidth={640} onRowClick={(r) => router.push(`${base}/${r.id}`)}
                  empty={<EmptyState compact title="Chưa có bộ nội quy" description="Quản trị trường tạo và ban hành bộ nội quy thi đua đầu tiên." />} />
              </div>
              <div className="flex gap-2.5 border-t border-line px-5 py-3 text-[13px] text-body"><Archive className="mt-0.5 size-4 flex-none text-primary" aria-hidden />Bản đã ban hành không bao giờ bị sửa ngầm. Muốn thay đổi, tạo bản mới có ngày hiệu lực từ hôm nay trở đi; các tuần đã chốt vẫn giữ đúng phiên bản nội quy đã dùng.</div>
            </Card>
            <ConfirmDialog open={create} onOpenChange={setCreate} title="Tạo bản nội quy mới" confirmLabel="Tạo bản nháp" busy={newCmd.pending}
              error={newCmd.error?.code === "VALIDATION" ? newCmd.error.message : undefined}
              consequence="Bản mới là bản nháp sao chép từ phiên bản được chọn, ngày hiệu lực dự kiến sau 7 ngày. Bản nháp chưa ảnh hưởng tới lớp nào cho đến khi được ban hành."
              onConfirm={async () => { if (from) await newCmd.run(from); }}>
              <SelectField label="Sao chép từ phiên bản" value={from} onChange={(e) => setFrom(e.target.value)} options={d.items.filter((r) => r.status !== "draft").map((r) => ({ value: r.id, label: `Bản ${r.versionNo} — ${r.name} (${RULESET_STATUS[r.status].label})` }))} />
            </ConfirmDialog>
          </div>
        );
      }}
    </QueryState>
  );
}

