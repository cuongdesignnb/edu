"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock3, Ban, UserRoundCheck, Building2, ArrowRight, Info, MailX } from "lucide-react";
import { sessionRepo,passwordErrors } from "@/lib/repositories";
import { useCommand, useRepo, useSession } from "@/lib/query/hooks";
import { fmtDateTime, invitationStatus, schoolStatus } from "@/lib/formatters";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout, InfoRow } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { SchoolMark } from "@/components/ui/avatar";
import { EmptyState, QueryState } from "@/components/ui/states";

import {PasswordField,PasswordRules} from "./password-field";
import {ErrorSummary} from "@/components/ui/form";

type Data = Awaited<ReturnType<typeof sessionRepo.invitation>>;

/** AU04 — accept/decline a staff invitation; handles accepted/expired/revoked/declined (ST12). */
export function InvitationView({ inviteId }: { inviteId: string }) {
  const [response,setResponse]=useState<{accepted:boolean;userId?:string}|null>(null);
  const q = useRepo(["invitation", inviteId], (ctx) => sessionRepo.invitation(ctx, inviteId), {enabled:!response});
  const router=useRouter(),{signIn}=useSession();
  if(response)return <EmptyState icon={response.accepted?<CheckCircle2 className="size-6" />:<MailX className="size-6" />} title={response.accepted?"Bạn đã trở thành thành viên của trường":"Đã từ chối lời mời"}
    description={response.accepted?"Phân công lớp/môn cụ thể do nhà trường thực hiện sau.":"Tài khoản và các trường khác của bạn được giữ nguyên."}
    action={response.accepted&&response.userId?<Button variant="primary" onClick={()=>{signIn({kind:'staff',userId:response.userId!},'invitation');router.push('/choose-school');}}>Vào không gian</Button>:<ButtonLink href="/login" variant={response.accepted?'primary':'secondary'}>{response.accepted?'Đăng nhập để tiếp tục':'Về đăng nhập'}</ButtonLink>} />;
  return <QueryState query={q} skeleton="none">{(d) => <InvitationBody d={d} onResponse={setResponse} />}</QueryState>;
}

function InvitationBody({ d,onResponse }: { d: Data;onResponse:(response:{accepted:boolean;userId?:string})=>void }) {
  const { invitation: inv, school, inviterName, existingUser } = d;
  const [fullName, setFullName] = useState(inv.fullName);
  const [nameError, setNameError] = useState<string>();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[errors,setErrors]=useState<Record<string,string>>({});
  const accept = useCommand((ctx, name?: string, newPassword?:string) => sessionRepo.respondInvitation(ctx, inv.id, true, name, newPassword), {changesAuthentication:true,success:`Đã chấp nhận lời mời của ${school.name}`,onError:e=>setErrors(e.fieldErrors??{form:e.message})});
  const decline = useCommand((ctx) => sessionRepo.respondInvitation(ctx, inv.id, false), { success: "Đã từ chối lời mời", onSuccess: r => {setDeclineOpen(false);onResponse(r);} });
  const isAdminInvite=inv.roleCodes.includes("SCHOOL_ADMIN");

  const onAccept = async () => {
    if (!existingUser && fullName.trim().length < 3) { setNameError("Họ tên tối thiểu 3 ký tự"); return; }
    setNameError(undefined);
    if(!existingUser){const validation=passwordErrors(password,confirm);setErrors(validation);if(Object.keys(validation).length)return;}
    const r=await accept.run(existingUser?undefined:fullName,existingUser?undefined:password);
    if(r?.accepted){setPassword("");setConfirm("");onResponse(r);}
  };

  const header = (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-[#f7fbff] p-4">
      <SchoolMark name={school.name} size={44} color={school.status === "active" ? "#0a72e6" : "#64748b"} />
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
      <ErrorSummary errors={errors} labels={{form:"Lời mời",newPassword:"Mật khẩu mới",password:"Mật khẩu mới",confirm:"Nhập lại mật khẩu"}} />
      {existingUser ? (
        <Callout tone="info" icon={<UserRoundCheck />} title="Bạn đã có danh tính EduManage">
          Tài khoản <b>{existingUser.email}</b> ({existingUser.fullName}) đã tồn tại. Chấp nhận chỉ thêm thành viên tại {school.name}; không đổi mật khẩu, không thay đổi quyền hay dữ liệu ở trường khác.
        </Callout>
      ) : (
        <>
          <Callout tone="neutral" icon={<Info />}>Đây là lời mời cho nhân sự mới. Xác nhận họ tên hiển thị; nhà trường sẽ phân công lớp/môn sau khi bạn chấp nhận.</Callout>
          <TextField label="Họ và tên hiển thị" required value={fullName} onChange={(e) => setFullName(e.target.value)} error={nameError} autoComplete="name" />
          <PasswordField id="invite-password" label="Mật khẩu mới" required value={password} onChange={e=>setPassword(e.target.value)} error={errors.password??errors.newPassword} autoComplete="new-password" />
          <PasswordRules value={password} />
          <PasswordField id="invite-confirm" label="Nhập lại mật khẩu mới" required value={confirm} onChange={e=>setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" />
        </>
      )}
      {school.status !== "active" && (
        <Callout tone="warning" icon={<Building2 />}>Trường đang ở trạng thái “{schoolStatus[school.status].label}”. Sau khi chấp nhận, bạn chỉ làm việc được khi nền tảng kích hoạt trường.</Callout>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={accept.pending} disabled={!!existingUser&&!d.signedInAsInvited} icon={<CheckCircle2 className="size-4" />} onClick={onAccept}>Chấp nhận lời mời</Button>
        <Button variant="secondary" icon={<XCircle className="size-4" />} onClick={() => setDeclineOpen(true)} disabled={accept.pending}>Từ chối</Button>
      </div>
      {existingUser&&!d.signedInAsInvited&&<Callout tone="warning" title="Đăng nhập đúng danh tính được mời" action={<ButtonLink href="/login">Đăng nhập</ButtonLink>}>Bạn cần đăng nhập bằng {existingUser.email}, sau đó quay lại đường dẫn lời mời.</Callout>}
      <ConfirmDialog open={declineOpen} onOpenChange={setDeclineOpen} title="Từ chối lời mời" object={`${school.name} — ${inv.proposedDuty}`}
        consequence="Lời mời sẽ không dùng được nữa. Tài khoản và các trường khác của bạn (nếu có) không bị ảnh hưởng." confirmLabel="Từ chối lời mời" variant="danger"
        busy={decline.pending} onConfirm={() => decline.run()} />
    </div>
  );
}
