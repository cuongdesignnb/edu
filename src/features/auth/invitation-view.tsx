"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock3, Ban, UserRoundCheck, Building2, ArrowRight, Info, MailX } from "lucide-react";
import { sessionRepo } from "@/lib/repositories";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import { fmtDateTime, invitationStatus, schoolStatus } from "@/lib/formatters";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout, InfoRow } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { SchoolMark } from "@/components/ui/avatar";
import { EmptyState, QueryState } from "@/components/ui/states";

type Data = Awaited<ReturnType<typeof sessionRepo.invitation>>;

/** AU04 — accept/decline a staff invitation; handles accepted/expired/revoked/declined (ST12). */
export function InvitationView({ inviteId }: { inviteId: string }) {
  const q = useRepo(["invitation", inviteId], (ctx) => sessionRepo.invitation(ctx, inviteId));
  return <QueryState query={q} skeleton="none">{(d) => <InvitationBody d={d} />}</QueryState>;
}

function InvitationBody({ d }: { d: Data }) {
  const { invitation: inv, school, inviterName, existingUser } = d;
  const router = useRouter();
  const { signIn } = useSession();
  const [fullName, setFullName] = useState(inv.fullName);
  const [nameError, setNameError] = useState<string>();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [acceptedUser, setAcceptedUser] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const accept = useCommand((ctx, name?: string) => sessionRepo.respondInvitation(ctx, inv.id, true, name), { success: `Đã chấp nhận lời mời của ${school.name}` });
  const decline = useCommand((ctx) => sessionRepo.respondInvitation(ctx, inv.id, false), { success: "Đã từ chối lời mời", onSuccess: () => setDeclineOpen(false) });
  const isAdminInvite = inv.roleTemplateIds.some((r) => r.endsWith("-role-admin"));

  const onAccept = async () => {
    if (!existingUser && fullName.trim().length < 3) { setNameError("Họ tên tối thiểu 3 ký tự"); return; }
    setNameError(undefined);
    const r = await accept.run(existingUser ? undefined : fullName);
    if (r?.userId) setAcceptedUser(r.userId);
  };

  const enter = () => {
    if (!acceptedUser) return;
    setEntering(true);
    signIn({ kind: "staff", userId: acceptedUser }, "invitation");
    router.push("/choose-school");
  };

  const header = (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-[#f7fbff] p-4">
      <SchoolMark name={school.name} size={44} color={school.status === "active" ? "#0a72e6" : "#8a9bb6"} />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold text-ink">{school.name}</p>
        <p className="text-[13px] text-muted">Người mời: {inviterName}</p>
      </div>
      <StatusBadge status={inv.status} map={invitationStatus} />
    </div>
  );

  const details = (
    <dl className="divide-y divide-line">
      <InfoRow label="Người được mời">{inv.fullName}</InfoRow>
      <InfoRow label="Email nhận lời mời">{inv.email}</InfoRow>
      <InfoRow label="Nhiệm vụ dự kiến">{inv.proposedDuty}{isAdminInvite && <Badge tone="purple" className="ml-2">Quản trị trường</Badge>}</InfoRow>
      <InfoRow label="Ngày mời">{fmtDateTime(inv.createdAt)}</InfoRow>
      <InfoRow label="Hạn chấp nhận">{fmtDateTime(inv.expiresAt)}</InfoRow>
      <InfoRow label="Trạng thái trường"><StatusBadge status={school.status} map={schoolStatus} /></InfoRow>
    </dl>
  );

  if (acceptedUser) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState icon={<CheckCircle2 className="size-6" />} title="Bạn đã trở thành thành viên của trường"
          description={<>Phân công lớp/môn cụ thể do nhà trường thực hiện sau. Nếu chưa được phân công, không gian sẽ hiển thị “Chưa được phân công”.</>}
          action={<Button variant="primary" loading={entering} iconRight={<ArrowRight className="size-4" />} onClick={enter}>Vào không gian (demo)</Button>} />
      </div>
    );
  }

  if (inv.status !== "pending") {
    const map = {
      accepted: { icon: <CheckCircle2 className="size-6" />, title: "Lời mời đã được chấp nhận", text: "Lời mời này đã được dùng. Hãy đăng nhập để vào không gian của trường.", action: <ButtonLink href="/login" variant="primary">Đăng nhập</ButtonLink> },
      expired: { icon: <Clock3 className="size-6" />, title: "Lời mời đã hết hạn", text: `Không thể chấp nhận lời mời đã quá hạn. Hãy liên hệ ${inviterName} tại ${school.name} để được mời lại.`, action: <ButtonLink href="/help#nha-truong">Xem hướng dẫn</ButtonLink> },
      revoked: { icon: <Ban className="size-6" />, title: "Lời mời đã bị thu hồi", text: `Nhà trường đã thu hồi lời mời này. Nếu cho rằng có nhầm lẫn, hãy liên hệ ${inviterName} tại ${school.name}.`, action: <ButtonLink href="/help#nha-truong">Xem hướng dẫn</ButtonLink> },
      declined: { icon: <MailX className="size-6" />, title: "Bạn đã từ chối lời mời", text: `Không có thay đổi nào với tài khoản của bạn. Nếu muốn tham gia, hãy đề nghị ${inviterName} gửi lời mời mới.`, action: <ButtonLink href="/login">Về đăng nhập</ButtonLink> },
      pending: null,
    }[inv.status]!;
    return (
      <div className="space-y-4">
        {header}
        <EmptyState icon={map.icon} title={map.title} description={map.text} action={map.action} compact />
        {details}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {details}
      {existingUser ? (
        <Callout tone="info" icon={<UserRoundCheck />} title="Bạn đã có danh tính EduManage">
          Tài khoản <b>{existingUser.email}</b> ({existingUser.fullName}) đã tồn tại. Chấp nhận chỉ thêm thành viên tại {school.name}; không đổi mật khẩu, không thay đổi quyền hay dữ liệu ở trường khác.
        </Callout>
      ) : (
        <>
          <Callout tone="neutral" icon={<Info />}>Đây là lời mời cho nhân sự mới. Xác nhận họ tên hiển thị; nhà trường sẽ phân công lớp/môn sau khi bạn chấp nhận.</Callout>
          <TextField label="Họ và tên hiển thị" required value={fullName} onChange={(e) => setFullName(e.target.value)} error={nameError} autoComplete="name" />
        </>
      )}
      {school.status !== "active" && (
        <Callout tone="warning" icon={<Building2 />}>Trường đang ở trạng thái “{schoolStatus[school.status].label}”. Sau khi chấp nhận, bạn chỉ làm việc được khi nền tảng kích hoạt trường.</Callout>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={accept.pending} icon={<CheckCircle2 className="size-4" />} onClick={onAccept}>Chấp nhận lời mời</Button>
        <Button variant="secondary" icon={<XCircle className="size-4" />} onClick={() => setDeclineOpen(true)} disabled={accept.pending}>Từ chối</Button>
      </div>
      <p className="text-[12.5px] text-muted">Mô phỏng: lời mời chỉ là đường dẫn demo, không có email thật và không có xác thực thật.</p>
      <ConfirmDialog open={declineOpen} onOpenChange={setDeclineOpen} title="Từ chối lời mời" object={`${school.name} — ${inv.proposedDuty}`}
        consequence="Lời mời sẽ không dùng được nữa. Tài khoản và các trường khác của bạn (nếu có) không bị ảnh hưởng." confirmLabel="Từ chối lời mời" variant="danger"
        busy={decline.pending} onConfirm={() => decline.run()} />
    </div>
  );
}
