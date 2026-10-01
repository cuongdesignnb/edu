"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CalendarClock, Download, Eye, History, Info, Lock, Megaphone, Paperclip, PenLine, Plus, School, Send, Trash2, Users } from "lucide-react";
import { announcementEstimateLine } from '@/lib/repositories/connected/announcements';
import { announcementsRepo } from "@/lib/repositories";
import { useCommand, useRepo } from "@/lib/query/hooks";
import { fmtDateTime } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { ActivitySectionTabs } from "@/features/activities/shared";
import { AnnouncementComposer, ParentPreview, type AnnouncementDetail } from "@/features/announcements/composer";
import { AnnouncementBody } from "@/features/announcements/body";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { ActionMenu } from "@/components/ui/menu";
import { InlineSelect } from "@/components/ui/form";
import { Timeline } from "@/components/ui/timeline";
import { downloadFileAsset } from "@/components/ui/file";
import { DeniedState, EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { FilterBar, Pagination } from "@/components/data/table";
import { matches } from "@/lib/formatters";

type ListData = Awaited<ReturnType<typeof announcementsRepo.classList>>;
type Own = ListData["own"][number];

const STATUS_OPTS = [{ value: "draft", label: "Nháp" }, { value: "scheduled", label: "Đã đặt lịch" }, { value: "published", label: "Đã công bố" }, { value: "withdrawn", label: "Đã thu hồi" }];

function scopeText(a: Pick<Own, "scope" | "scopeLabel">) {
  return a.scope.type === "student" ? `Riêng ${(a.scope.studentIds ?? []).length === 1 ? "em" : `${(a.scope.studentIds ?? []).length} em`}: ${a.scopeLabel.replace(/^Riêng: /, "")}` : a.scopeLabel;
}

/** CL21 — class announcements: own (draft / scheduled / published / withdrawn) + "Từ nhà trường". */
export function ClassAnnouncementsPage() {
  const { schoolId, yearId, classId, base, header, readOnly } = useClassroom();
  const allowed = header.nativeActions.includes("announcement.read");
  const q = useRepo(["class-announcements", schoolId, yearId, classId], (ctx) => announcementsRepo.classList(ctx, schoolId, yearId, classId), { enabled: allowed });
  const canCompose = allowed && !readOnly && q.data?.canCompose === true;
  return (
    <div className="page">
      <ClassHeader variant="compact" title="Thông báo lớp" subtitle={<>Thông báo gửi gia đình học sinh lớp {header.class.name} — chỉ trong lớp này</>}
        actions={canCompose ? <ButtonLink href={`${base}/announcements/new`} variant="primary" icon={<Plus className="size-4" />}>Soạn thông báo</ButtonLink> : undefined} />
      <ActivitySectionTabs />
      {!allowed ? <div className="card"><DeniedState message="Bạn không được phân công gửi thông báo cho lớp này (chỉ giáo viên chủ nhiệm)." /></div> : (
        <QueryState query={q} skeleton="table">{(d) => <ListBody d={d} />}</QueryState>
      )}
    </div>
  );
}

function ListBody({ d }: { d: ListData }) {
  const { base } = useClassroom();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => d.own.filter((a) => (!status || a.status === status) && matches(q, a.title, a.summary)), [d.own, q, status]);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const rows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const counts = STATUS_OPTS.map((s) => ({ ...s, n: d.own.filter((a) => a.status === s.value).length }));
  const active = !!(q || status);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardHeader title="Thông báo của lớp" icon={<Megaphone className="size-5 text-primary" />} subtitle={counts.map((c) => `${c.n} ${c.label.toLowerCase()}`).join(" · ")} />
        <FilterBar q={q} onQ={(v) => { setQ(v); setPage(1); }} placeholder="Tìm tiêu đề hoặc tóm tắt" active={active} onReset={() => { setQ(""); setStatus(""); setPage(1); }}>
          <InlineSelect label="Lọc trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTS} allLabel="Tất cả trạng thái" />
        </FilterBar>
        {!d.own.length ? <EmptyState compact icon={<Megaphone className="size-6" />} title="Lớp chưa có thông báo" description="Soạn thông báo gửi gia đình cả lớp hoặc riêng từng em." /> : !filtered.length ? <EmptyFiltered what="thông báo" onReset={() => { setQ(""); setStatus(""); }} /> : (
          <ul className="divide-y divide-line px-5">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 py-3.5">
                <div className="min-w-0 flex-[1_1_300px]">
                  <Link href={`${base}/announcements/${a.id}`} className="font-semibold text-ink hover:text-primary-strong">{a.title}</Link>
                  <p className="line-clamp-2 text-[13px] text-muted">{a.summary}</p>
                  <p className="mt-1 text-[12.5px] text-body">Đối tượng: {scopeText(a)} · {a.audienceLabel}</p>
                  <p className="text-[12px] text-muted">
                    {a.status === "published" && a.publishedAt ? `Công bố ${fmtDateTime(a.publishedAt)}` : a.status === "scheduled" && a.scheduledAt ? `Hẹn công bố ${fmtDateTime(a.scheduledAt)}` : a.status === "withdrawn" && a.withdrawnAt ? `Thu hồi ${fmtDateTime(a.withdrawnAt)}` : `Cập nhật ${fmtDateTime(a.updatedAt)}`} · {a.createdByName}
                  </p>
                </div>
                <StatusBadge status={a.status} map={PUBLICATION_STATUS} />
                <ActionMenu label={`Thao tác cho ${a.title}`} items={[
                  { label: "Mở chi tiết", icon: <Eye />, href: `${base}/announcements/${a.id}` },
                  ...(a.status === "draft" || a.status === "scheduled" ? [{ label: "Sửa", icon: <PenLine />, href: `${base}/announcements/${a.id}/edit` }] : []),
                ]} />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={cur} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} what="thông báo" />
      </Card>
      <Card className="min-w-0">
        <CardHeader title="Từ nhà trường" icon={<School className="size-5 text-primary" />} subtitle="Thông báo nhà trường đã công bố có phạm vi gồm lớp này (chỉ đọc)" />
        {!d.fromSchool.length ? <EmptyState compact title="Chưa có thông báo từ nhà trường" /> : (
          <ul className="divide-y divide-line px-5 pb-3">
            {d.fromSchool.map((a) => (
              <li key={a.id} className="py-3">
                <p className="font-semibold text-ink">{a.title}</p>
                <p className="line-clamp-2 text-[13px] text-muted">{a.summary}</p>
                <p className="mt-1 text-[12px] text-muted">{a.scopeLabel} · {a.publishedAt ? fmtDateTime(a.publishedAt) : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** CL22 — composer in class mode (whole class or students of this class only). Edit when announcementId is given. */
export function ClassAnnouncementComposePage({ announcementId }: { announcementId?: string }) {
  const { schoolId, yearId, classId, base, header, readOnly } = useClassroom();
  const router = useRouter();
  const allowed = header.nativeActions.includes("announcement.manage") && !readOnly;
  const q = useRepo(["announcement", schoolId, yearId, classId, announcementId ?? "new"], (ctx) => (announcementId ? announcementsRepo.detail(ctx, schoolId, announcementId, {yearId,classId}) : Promise.resolve(null)), { enabled: allowed });
  const title = announcementId ? "Sửa thông báo lớp" : "Soạn thông báo lớp";
  const back = announcementId ? `${base}/announcements/${announcementId}` : `${base}/announcements`;
  return (
    <div className="page">
      <ClassHeader variant="compact" title={title} subtitle="Chỉ gửi đến gia đình học sinh của lớp này — cả lớp hoặc riêng từng em. Không chọn lớp hoặc trường khác."
        crumbs={[{ label: "Thông báo", href: `${base}/announcements` }, { label: title }]} actions={<ButtonLink href={back} variant="ghost">Hủy</ButtonLink>} />
      {!allowed ? <div className="card"><DeniedState message={readOnly ? "Năm học đã lưu trữ — không soạn thông báo." : "Bạn không được phân công gửi thông báo cho lớp này."} /></div> : (
        <QueryState query={q} skeleton="form">
          {(a) => a && (a.originClassId !== classId || (!a.canEdit || (a.status !== "draft" && a.status !== "scheduled" && a.status !== "published")))
            ? <div className="card"><DeniedState message={a.originClassId !== classId ? "Thông báo này không thuộc lớp hiện tại." : "Thông báo đã thu hồi — hãy tạo thông báo mới."} /></div>
            : <AnnouncementComposer key={a?.version ?? "new"} schoolId={schoolId} yearId={yearId} origin="class" classId={classId} announcement={a ?? undefined} onDone={(id) => router.push(`${base}/announcements/${id}`)} />}
        </QueryState>
      )}
    </div>
  );
}

/** CL23 — class announcement detail: content, audience, estimate, status, history, attachments, internal note; edit / publish / withdraw / delete draft (O29, O31). */
export function ClassAnnouncementDetailPage({ announcementId }: { announcementId: string }) {
  const { schoolId, yearId, classId, base, header } = useClassroom();
  const allowed = header.nativeActions.includes("announcement.read");
  const q = useRepo(["announcement", schoolId, yearId, classId, announcementId], (ctx) => announcementsRepo.detail(ctx, schoolId, announcementId, {yearId,classId}), { enabled: allowed });
  return (
    <div className="page">
      <ClassHeader variant="compact" title={q.data?.title ?? "Chi tiết thông báo"} crumbs={[{ label: "Thông báo", href: `${base}/announcements` }, { label: q.data?.title ?? "Chi tiết" }]}
        subtitle={q.data ? <span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={q.data.status} map={PUBLICATION_STATUS} />Thông báo của lớp {q.data.className}</span> : undefined} />
      {!allowed ? <div className="card"><DeniedState message="Bạn không được phân công gửi thông báo cho lớp này." /></div> : (
        <QueryState query={q} skeleton="detail">
          {(a) => a.originClassId !== classId ? <div className="card"><DeniedState message="Thông báo này không thuộc lớp hiện tại." /></div> : <DetailBody a={a} />}
        </QueryState>
      )}
    </div>
  );
}

function DetailBody({ a }: { a: AnnouncementDetail }) {
  const { schoolId, base, readOnly } = useClassroom();
  const router = useRouter();
  const [dlg, setDlg] = useState<"publish" | "withdraw" | "delete" | null>(null);
  const [preview, setPreview] = useState(false);
  const publish = useCommand((ctx) => announcementsRepo.publish(ctx, schoolId, a.source), { success: "Đã công bố thông báo lớp", onSuccess: () => setDlg(null) });
  const withdraw = useCommand((ctx, reason: string) => announcementsRepo.withdraw(ctx, schoolId, a.source, reason), { success: "Đã thu hồi thông báo", onSuccess: () => setDlg(null) });
  const remove = useCommand((ctx) => announcementsRepo.deleteDraft(ctx, schoolId, a.source), { success: "Đã xóa bản nháp", onSuccess: () => router.push(`${base}/announcements`) });
  const canEdit = a.canEdit && !readOnly;
  const estimateLine = announcementEstimateLine(a.estimate, a.audience);
  const files = a.attachments.filter(Boolean) as NonNullable<AnnouncementDetail["attachments"][number]>[];
  const audience = a.scope.type === "class" ? `Lớp ${a.className}` : `Riêng ${a.scopeLabel.replace(/^Riêng: /, "")}`;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Eye className="size-4" />} onClick={() => setPreview(true)}>Xem như phụ huynh</Button>
        {canEdit && (a.status === "draft" || a.status === "scheduled") && <ButtonLink href={`${base}/announcements/${a.id}/edit`} icon={<PenLine className="size-4" />}>Sửa</ButtonLink>}
        {a.canDelete && a.status === "draft" && <Button variant="danger-soft" icon={<Trash2 className="size-4" />} onClick={() => setDlg("delete")}>Xóa nháp</Button>}
        {a.canWithdraw && !readOnly && (a.status === "published" || a.status === "scheduled") && <Button variant="danger-soft" icon={<Ban className="size-4" />} onClick={() => setDlg("withdraw")}>Thu hồi</Button>}
        {a.canPublish && (a.status === "draft" || a.status === "scheduled") && <Button variant="primary" icon={<Send className="size-4" />} onClick={() => setDlg("publish")}>Công bố ngay</Button>}
      </div>
      {a.status === "withdrawn" && <Callout tone="danger" icon={<Ban />} title={`Đã thu hồi lúc ${fmtDateTime(a.withdrawnAt)}`}>Lý do: {a.withdrawReason}. Gia đình không còn thấy thông báo ở lần mở trang tiếp theo.</Callout>}
      {a.status === "scheduled" && <Callout tone="info" icon={<CalendarClock />} title={`Đã đặt lịch công bố lúc ${fmtDateTime(a.scheduledAt)}`}>Máy chủ sẽ kiểm tra lại quyền và người nhận khi đến lịch công bố.</Callout>}
      {a.status === "draft" && <Callout tone="neutral" icon={<Info />} title="Bản nháp — gia đình chưa thấy">Công bố để gia đình trong phạm vi thấy ở lần mở link tra cứu tiếp theo.</Callout>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <p className="text-[15px] font-medium text-body">{a.summary}</p>
            <div className="my-4 h-px bg-line" />
            <AnnouncementBody body={a.body} />
          </Card>
          <Card>
            <CardHeader title="Tệp đính kèm" icon={<Paperclip className="size-5" />} />
            <div className="px-5 pb-5">
              {files.length ? <ul className="space-y-2">{files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <Paperclip className="size-4 text-primary" aria-hidden /><span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.name}</span>
                  <Button size="sm" variant="ghost" icon={<Download className="size-4" />} disabled={!f.canDownload} onClick={() => downloadFileAsset(f)}>Tải xuống</Button>
                </li>
              ))}</ul> : <p className="text-sm text-muted">Không có tệp đính kèm.</p>}
            </div>
          </Card>
          {a.historyView !== null && <Card>
            <CardHeader title="Lịch sử" icon={<History className="size-5" />} subtitle="Chỉ đọc." />
            <div className="px-6 pb-5"><Timeline items={[...a.historyView].reverse().map((h) => ({ id: h.id, at: h.at, title: h.action, actor: h.byName, tone: h.action.startsWith("Thu hồi") ? "red" : h.action.startsWith("Công bố") ? "green" : "blue" }))} /></div>
          </Card>}
        </div>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Người nhận" icon={<Users className="size-5" />} />
            <dl className="px-5 pb-4">
              <InfoRow label="Phạm vi">{audience}</InfoRow>
              <InfoRow label="Đối tượng">{a.audienceLabel}</InfoRow>
              <InfoRow label="Ước tính">{estimateLine}</InfoRow>
              <InfoRow label="Trạng thái"><StatusBadge status={a.status} map={PUBLICATION_STATUS} /></InfoRow>
              <InfoRow label="Người tạo">{a.createdByName}</InfoRow>
              <InfoRow label="Tạo lúc">{fmtDateTime(a.createdAt)}</InfoRow>
              {a.publishedAt && <InfoRow label="Công bố lúc">{fmtDateTime(a.publishedAt)}</InfoRow>}
              <InfoRow label="Phiên bản">{a.version}</InfoRow>
            </dl>
            <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Ước tính từ học sinh đang học và link hiện có. Không gửi email/Zalo thật; gia đình xem qua link tra cứu.</p>
          </Card>
          {a.canViewInternal && <Card className="border-dashed">
            <CardHeader title="Ghi chú nội bộ" icon={<Lock className="size-5" />} action={<Badge tone="neutral">Nội bộ — phụ huynh không thấy</Badge>} />
            <p className="px-5 pb-5 text-sm text-body">{a.internalNote || "Không có ghi chú."}</p>
          </Card>}
        </div>
      </div>
      <Modal open={preview} onOpenChange={setPreview} title="Xem trước như phụ huynh" size="md" footer={<Button onClick={() => setPreview(false)}>Đóng</Button>}
        description={a.status === "published" ? "Nội dung gia đình trong phạm vi đang thấy (không gồm ghi chú nội bộ)." : "Gia đình chưa thấy — thông báo chưa công bố."}>
        <ParentPreview title={a.title} summary={a.summary} body={a.body} audience={a.audience} files={files} isPublic={false} />
      </Modal>
      <ConfirmDialog open={dlg === "publish"} onOpenChange={(o) => !o && setDlg(null)} title="Công bố thông báo lớp" object={a.title} confirmLabel="Công bố" busy={publish.pending}
        error={publish.error?.code === "VALIDATION" ? Object.values(publish.error.fieldErrors ?? {}).join("; ") || publish.error.message : undefined}
        consequence={<div className="space-y-1"><p><b>Phạm vi:</b> {audience} · <b>Đối tượng:</b> {a.audienceLabel}</p><p><b>Ước tính:</b> {estimateLine}</p><p>Gia đình thấy thông báo ở lần mở link tiếp theo. Có thể thu hồi sau, nhưng không thu hồi được nội dung đã được đọc.</p></div>}
        onConfirm={async () => { await publish.run(); }} />
      <ConfirmDialog open={dlg === "withdraw"} onOpenChange={(o) => !o && setDlg(null)} title={a.status === "scheduled" ? "Thu hồi lịch công bố" : "Thu hồi thông báo"} object={a.title} variant="danger" confirmLabel="Thu hồi" busy={withdraw.pending}
        reasonLabel="Lý do thu hồi" reasonRequired error={withdraw.error?.code === "VALIDATION" ? withdraw.error.fieldErrors?.reason ?? withdraw.error.message : undefined}
        consequence="Thông báo chuyển sang “Đã thu hồi”; gia đình không thấy ở lần mở tiếp theo. Lịch sử và lý do được giữ lại."
        onConfirm={async (reason) => { await withdraw.run(reason); }} />
      <ConfirmDialog open={dlg === "delete"} onOpenChange={(o) => !o && setDlg(null)} title="Xóa bản nháp thông báo" object={a.title} variant="danger" confirmLabel="Xóa bản nháp" busy={remove.pending}
        error={remove.error?.code === "VALIDATION" ? remove.error.message : undefined}
        consequence="Bản nháp chưa từng công bố sẽ bị xóa; thao tác được ghi nhật ký. Thông báo đã công bố không xóa được — hãy thu hồi." onConfirm={async () => { await remove.run(); }} />
    </>
  );
}
