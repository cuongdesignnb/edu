"use client";
import {useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {AlertTriangle,CheckCircle2,ExternalLink,Info,Printer} from 'lucide-react';
import {studentsRepo,studentsExtraRepo,type RepoError} from '@/lib/repositories';
import {useCommand,useRepo} from '@/lib/query/hooks';
import type {ParentModule} from '@/lib/model/types';
import type {ParentIssueInput,ParentIssueSource} from '@/lib/repositories/connected/parent-access-issue';
import {parentIssueContext} from '@/lib/repositories/connected/parent-access-issue';
import {fmtDate,fmtDateTime,parentModuleLabel,verificationStatus} from '@/lib/formatters';
import {Modal} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Callout} from '@/components/ui/card';
import {StatusBadge} from '@/components/ui/badge';
import {Checkbox,DateField,ErrorSummary,TextArea} from '@/components/ui/form';
import {Combobox} from '@/components/ui/combobox';
import {ErrorState,Skeleton} from '@/components/ui/states';
import {ConflictDialog} from '@/components/ui/guards';
import {ALL_MODULES,MODULE_HINT,QrImage,LinkBox,QrPrintCard,fieldErrorsOf,usePrintQr} from './shared';

export interface ParentLinkReplacement {accessId:string;version?:number;relationshipId:string;modules:ParentModule[];allowDownload?:boolean;label:string}
interface Props {open:boolean;onOpenChange:(open:boolean)=>void;schoolId:string;studentId?:string;relationshipId?:string;replace?:ParentLinkReplacement|null}
type Context=Awaited<ReturnType<typeof studentsExtraRepo.issueContext>>;
function SourceModal({onOpenChange,error,retry}:{onOpenChange:Props['onOpenChange'];error?:RepoError|null;retry?:()=>unknown}){
  return <Modal open onOpenChange={onOpenChange} title="Cấp đường dẫn riêng cho phụ huynh" size="lg" footer={<Button variant="ghost" onClick={()=>onOpenChange(false)}>Đóng</Button>}>
    {error?<ErrorState error={error} onRetry={retry} compact/>:<Skeleton className="h-64"/>}
  </Modal>;
}
export function IssueAccessDialog(props:Props){return props.open?<IssueContext {...props}/>:null;}
function IssueContext(props:Props){
  const q=useRepo(['students-issue-ctx',props.schoolId],ctx=>studentsExtraRepo.issueContext(ctx,props.schoolId));
  if(q.error&&q.error.code!=='READ_ERROR'||!q.data)return <SourceModal onOpenChange={props.onOpenChange} error={q.error} retry={()=>q.refetch()}/>;
  if(!q.data.year)return <Modal open onOpenChange={props.onOpenChange} title="Cấp đường dẫn riêng cho phụ huynh" size="lg"><Callout tone="info">Trường chưa có năm học đang hoạt động để cấp link.</Callout></Modal>;
  return <IssueSelector {...props} context={q.data}/>;
}
function IssueSelector(props:Props&{context:Context}){
  const [context]=useState(props.context),[studentId,setStudentId]=useState(props.studentId??''),[selectedLabel,setSelectedLabel]=useState<string>(),[search,setSearch]=useState(''),[query,setQuery]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search),250);return()=>clearTimeout(timer);},[search]);
  const choices=useRepo(['parent-issue-students',props.schoolId,context.year!.id,query],ctx=>studentsExtraRepo.issueStudents(ctx,props.schoolId,{q:query,page:1,pageSize:100},context.year!.id),{enabled:!props.studentId});
  const source=useRepo(['parent-issue-source',props.schoolId,studentId,context.year!.id],ctx=>studentsExtraRepo.issueCandidates(ctx,props.schoolId,studentId,context.year!.id),{enabled:!!studentId});
  if(choices.error&&['FORBIDDEN','NO_SESSION','NOT_FOUND','SUSPENDED'].includes(choices.error.code))return <SourceModal onOpenChange={props.onOpenChange} error={choices.error}/>;
  const selector:ReactNode=!props.studentId?<div data-field="studentId" className="space-y-2">
    <Combobox label="Học sinh" required value={studentId} selectedLabel={selectedLabel} onChange={value=>{const id=String(value);setStudentId(id);const row=choices.data?.items.find(s=>s.id===id);setSelectedLabel(row?`${row.fullName} (${row.studentCode})`:undefined);}} onSearchChange={setSearch}
      options={choices.error||choices.isFetching||search!==query?[]:(choices.data?.items??[]).map(s=>({value:s.id,label:`${s.fullName} (${s.studentCode})`,hint:`Lớp ${s.className}`}))} placeholder="Tìm theo tên hoặc mã…" emptyText={choices.isFetching||search!==query?'Đang tìm học sinh…':'Không có học sinh phù hợp'}
      helper={choices.data?.total&&choices.data.total>100?`Đang hiển thị ${choices.data.items.length}/${choices.data.total} kết quả. Nhập thêm tên hoặc mã để tìm đúng học sinh.`:undefined}/>
    {choices.error&&<ErrorState error={choices.error} onRetry={()=>choices.refetch()} compact/>}
  </div>:null;
  if(!studentId)return <Modal open onOpenChange={props.onOpenChange} title="Cấp đường dẫn riêng cho phụ huynh" size="lg" footer={<Button variant="ghost" onClick={()=>props.onOpenChange(false)}>Hủy</Button>}>{selector}</Modal>;
  if(source.error&&source.error.code!=='READ_ERROR'||!source.data)return <SourceModal onOpenChange={props.onOpenChange} error={source.error} retry={()=>source.refetch()}/>;
  return <ReviewedIssueForm key={studentId} {...props} source={source.data} selector={selector} readError={source.error} reload={async()=>{const response=await source.refetch();return response.error?undefined:response.data;}}/>;
}
function ReviewedIssueForm(props:Props&{source:ParentIssueSource;selector:ReactNode;readError:RepoError|null;reload:()=>Promise<ParentIssueSource|undefined>}){
  const [replacement]=useState(props.replace);
  const [source,setSource]=useState(props.source),[relId,setRelId]=useState(replacement?.relationshipId??props.relationshipId??''),[modules,setModules]=useState<ParentModule[]>(()=>replacement?.modules??parentIssueContext(props.source.context,props.schoolId).defaultModules),
    [allowDownload,setAllowDownload]=useState(replacement?.allowDownload??false),[expires,setExpires]=useState<string|undefined>(props.source.context.year!.suggestedExpiryOn),[reason,setReason]=useState(''),[local,setLocal]=useState<Record<string,string>>({}),[warn,setWarn]=useState(false),[issued,setIssued]=useState<Awaited<ReturnType<typeof studentsRepo.issueAccess>>|null>(null);
  const cmd=useCommand((ctx,input:ParentIssueInput)=>studentsRepo.issueAccess(ctx,props.schoolId,input),{success:replacement?'Đã cấp lại link — link cũ đã bị thu hồi':'Đã cấp link tra cứu riêng'});
  const {print,node}=usePrintQr(),relationship=source.relationships.find(r=>r.id===relId),lostReceipt=cmd.error?.details?.problemCode==='LINK_ALREADY_ISSUED',linkChanged=cmd.error?.details?.problemCode==='VERSION_CONFLICT';
  const errs={...local,...fieldErrorsOf(cmd.error)},dirty=!issued&&(!!relId||!!reason||modules.join('|')!==parentIssueContext(source.context,props.schoolId).defaultModules.join('|')||allowDownload||expires!==source.context.year!.suggestedExpiryOn);
  const close=()=>props.onOpenChange(false),beforeClose=()=>{if(dirty&&!warn){setWarn(true);return false;}return true;};
  const submit=async()=>{
    const errors:Record<string,string>={};if(!relationship?.canIssue)errors.relationshipId='Chọn người nhận đã xác minh và được phép nhận thông tin';if(!modules.length)errors.modules='Chọn ít nhất một mục được xem';if(!expires)errors.expiresOn='Chọn hạn sử dụng';if(replacement&&reason.trim().length<3)errors.reason='Ghi lý do cấp lại';setLocal(errors);if(Object.keys(errors).length)return;
    const receipt=await cmd.run({source,relationshipId:relId,modules,allowDownload,expiresOn:expires!,replace:replacement?{accessId:replacement.accessId,version:replacement.version}:undefined,reason:replacement?reason:undefined});if(receipt)setIssued(receipt);
  };
  if(cmd.error&&['FORBIDDEN','NO_SESSION','NOT_FOUND','SUSPENDED'].includes(cmd.error.code))return <SourceModal onOpenChange={props.onOpenChange} error={cmd.error}/>;
  return <><Modal open onOpenChange={props.onOpenChange} busy={cmd.pending} beforeClose={beforeClose} size="lg" title={issued?'Đã cấp link tra cứu':replacement?'Cấp lại link tra cứu':'Cấp đường dẫn riêng cho phụ huynh'}
    description={issued?'Link và mã QR chỉ hiển thị đầy đủ ở bước này. Hãy trao tận tay người được cấp.':'Một link cho một học sinh, một người giám hộ đã xác minh, trong năm học hiện tại.'}
    footer={issued?<><Link href={`/school/${props.schoolId}/parent-access/${issued.id}`} className="btn btn-ghost">Xem chi tiết quyền</Link><Button icon={<Printer className="size-4"/>} onClick={()=>print(<QrPrintCard url={issued.link} studentName={source.student.fullName} className={source.class.name} relation={relationship?.relationshipLabel??''} schoolName={source.context.schoolName} expiresAt={issued.expiresAt}/>)}>In QR</Button><Button variant="primary" onClick={close}>Xong</Button></>:<><Button variant="ghost" disabled={cmd.pending} onClick={close}>Hủy</Button><Button variant="primary" loading={cmd.pending} onClick={submit} disabled={!!lostReceipt||!!linkChanged||!relationship?.canIssue||source.student.status!=='ACTIVE'||!!props.readError}>{replacement?'Thu hồi link cũ và cấp link mới':'Cấp link'}</Button></>}>
    {node}{props.readError&&<ErrorState error={props.readError} onRetry={()=>props.reload()} compact/>}
    {issued?<div className="space-y-4"><Callout tone="success" icon={<CheckCircle2/>} title={`Link cấp cho ${relationship?.relationshipLabel.toLowerCase()} của ${source.student.fullName}`}>Hiệu lực đến {fmtDateTime(issued.expiresAt)} · {issued.modules.length} mục được xem.{replacement?' Link cũ đã bị chặn ngay.':''}</Callout>
      <div className="grid gap-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:items-center"><div className="mx-auto rounded-xl border border-line bg-white p-3"><QrImage url={issued.link} size={148}/></div><div className="min-w-0 space-y-3"><LinkBox url={issued.link}/><a href={issued.link} target="_blank" rel="noreferrer" className="card-link">Mở link tra cứu <ExternalLink className="size-3.5" aria-hidden/></a><p className="text-[13px] text-muted">Mục được xem: {issued.modules.map(m=>parentModuleLabel[m]).join(', ')}. {issued.allowDownload?'Được tải tài liệu.':'Chỉ xem tài liệu nếu được chọn.'}</p></div></div>
      <Callout tone="warning" icon={<AlertTriangle/>} title="Không đăng vào nhóm chung">Ai có link đều có thể dùng quyền xem trong thời hạn. Chỉ gửi riêng cho người được cấp; nếu lộ link, thu hồi và cấp lại.</Callout></div>:<div className="space-y-4">
      {warn&&<Callout tone="warning" title="Bạn có thay đổi chưa lưu">Đóng lần nữa để bỏ nội dung đang chọn.</Callout>}
      <ErrorSummary errors={errs} labels={{relationshipId:'Người giám hộ',modules:'Mục được xem',expiresOn:'Hạn sử dụng',reason:'Lý do',allowDownload:'Quyền tải'}}/>
      {cmd.error&&<Callout tone="warning" title={lostReceipt?'Link đã được cấp':'Chưa cấp được link'}>{cmd.error.message}{typeof cmd.error.details?.resultId==='string'&&<Link href={`/school/${props.schoolId}/parent-access/${cmd.error.details.resultId}`} className="card-link block mt-2">Xem quyền đã cấp để chủ động cấp lại</Link>}{linkChanged&&<p className="mt-2">Đóng hộp thoại và tải lại trang đang xem để kiểm tra phiên bản link trước khi cấp lại.</p>}</Callout>}
      {replacement&&<Callout tone="info" icon={<Info/>}>Cấp lại sẽ thu hồi link cũ ({replacement.label}) và tạo link mới cho cùng người nhận.</Callout>}
      {props.selector}<p className="text-sm text-muted">{source.student.fullName} ({source.student.studentCode}) · Lớp {source.class.name}</p>
      <fieldset data-field="relationshipId" className="field"><legend className="label mb-1.5">Người giám hộ được cấp<span className="req" aria-hidden>*</span></legend>
        {!source.relationships.length?<p className="text-sm text-muted">Thêm và xác minh người giám hộ trước khi cấp link.</p>:<div className="space-y-2" role="radiogroup">{source.relationships.map(r=>{const locked=!!replacement&&r.id!==replacement.relationshipId;return <label key={r.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${relId===r.id?'border-[#9cc7f5] bg-primary-light':'border-line'} ${r.canIssue&&!locked?'cursor-pointer':'cursor-not-allowed opacity-70'}`}>
          <input type="radio" name="issue-rel" className="mt-1 size-4 accent-[var(--color-primary)]" checked={relId===r.id} disabled={!r.canIssue||locked} onChange={()=>setRelId(r.id)}/><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b className="text-ink">{r.guardianName}</b><span className="text-muted">{r.relationshipLabel}</span><StatusBadge status={r.status.toLowerCase()} map={verificationStatus}/></span><span className="block text-[12.5px] text-muted">{r.activeLinkIds.length?`Đang có ${r.activeLinkIds.length} link hoạt động`:''}</span>{!r.canIssue&&<span className="mt-0.5 block text-[12.5px] font-semibold text-warning-text">Cần xác minh và cho phép nhận thông tin</span>}</span></label>;})}</div>}{errs.relationshipId&&<p className="error-text mt-1">{errs.relationshipId}</p>}</fieldset>
      {source.student.status!=='ACTIVE'&&<Callout tone="warning">Học sinh không còn theo học — không cấp link mới.</Callout>}
      <fieldset data-field="modules" className="field"><legend className="label mb-1.5">Mục phụ huynh được xem<span className="req" aria-hidden>*</span></legend><p className="helper mb-2">Mặc định theo chính sách chia sẻ của trường. Chỉ dữ liệu đã công bố mới hiển thị.</p><div className="grid gap-2 sm:grid-cols-2">{ALL_MODULES.map(m=><Checkbox key={m} label={parentModuleLabel[m]} description={MODULE_HINT[m]} checked={modules.includes(m)} onChange={v=>{setModules(v?[...modules,m]:modules.filter(x=>x!==m));if(m==='documents'&&!v)setAllowDownload(false);}} className="rounded-lg border border-line px-3 py-2"/>)}</div>{errs.modules&&<p className="error-text mt-1">{errs.modules}</p>}</fieldset>
      <Checkbox label="Cho phép tải tài liệu" description="Quyền tải chỉ có hiệu lực với tài liệu đã công bố và khi được xem mục Tài liệu." checked={allowDownload} disabled={!modules.includes('documents')} onChange={setAllowDownload}/>
      <div className="grid gap-4 sm:grid-cols-2"><DateField label="Hạn sử dụng" required value={expires} onChange={setExpires} min={source.context.today} max={source.context.year!.lastDay} error={errs.expiresOn} helper={`Tối đa ${source.context.ttlDays} ngày và hết năm học ${source.context.year!.name} (${fmtDate(source.context.year!.lastDay)}). Hạn thực tế được xác nhận sau khi cấp.`}/><div className="field"><span className="label">Năm học</span><p className="input flex items-center bg-neutral-bg">{source.context.year!.name}</p></div></div>
      {replacement&&<TextArea label="Lý do cấp lại" required rows={2} value={reason} onChange={event=>setReason(event.target.value)} error={errs.reason}/>}
    </div>}
  </Modal><ConflictDialog error={lostReceipt||linkChanged?null:cmd.error} onClose={()=>cmd.reset()} onReload={async()=>{const next=await props.reload();if(next){setSource(next);setRelId(replacement?.relationshipId??props.relationshipId??'');setModules(replacement?.modules??parentIssueContext(next.context,props.schoolId).defaultModules);setAllowDownload(replacement?.allowDownload??false);setExpires(next.context.year!.suggestedExpiryOn);setReason('');setLocal({});cmd.reset();}}} mine={<p>{relationship?.guardianName} · {modules.map(m=>parentModuleLabel[m]).join(', ')} · {expires}</p>}/></>;
}
