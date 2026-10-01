"use client";
import {useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {AlertTriangle,Ban,CheckCircle2,Clock,Eye,Info,KeyRound,Link2,MonitorSmartphone,QrCode,RefreshCw} from 'lucide-react';
import type {ParentModule} from '@/lib/model/types';
import {studentsRepo} from '@/lib/repositories';
import {useRepo} from '@/lib/query/hooks';
import {fmtDate,fmtDateTime,fmtNumber,parentModuleLabel} from '@/lib/formatters';
import {PageHeader} from '@/components/layout/page';
import {KpiCard} from '@/components/data/kpi';
import {Card,CardHeader,Callout,InfoRow} from '@/components/ui/card';
import {StatusBadge} from '@/components/ui/badge';
import {Button,ButtonLink} from '@/components/ui/button';
import {ActionMenu} from '@/components/ui/menu';
import {InlineSelect} from '@/components/ui/form';
import {EmptyFiltered,EmptyState} from '@/components/ui/states';
import {DataTable,FilterBar,Pagination,useListQuery,type Column} from '@/components/data/table';
import {SchoolSourceState} from '@/features/school-org/common';
import {ACCESS_STATUS} from './shared';
import {IssueAccessDialog,RevokeAccessDialog,type ParentLinkRevokeTarget} from './dialogs';
import type {ParentLinkReplacement} from './issue-access-dialog';

type Directory=Awaited<ReturnType<typeof studentsRepo.accessList>>;
type Row=Directory['items'][number];
type Details=Awaited<ReturnType<typeof studentsRepo.access>>;
const revokeTarget=(row:Row,label:string):ParentLinkRevokeTarget=>({accessId:row.id,label,source:{version:row.version,studentId:row.studentId,yearId:row.yearId,relationshipId:row.relationshipId}});
const replacement=(row:Row,label:string):ParentLinkReplacement=>({accessId:row.id,version:row.version,relationshipId:row.relationshipId,modules:row.modules,allowDownload:row.allowDownload,label});
export function AccessListPage({schoolId}:{schoolId:string}){
  const params=useSearchParams(),list=useListQuery({pageSize:10,sort:'issuedAt',dir:'desc'});
  const query={...list.query,filters:{...list.query.filters,...(params.get('studentId')?{studentId:params.get('studentId')!}:{}),...(params.get('yearId')?{yearId:params.get('yearId')!}:{})}};
  const q=useRepo(['parent-access-list',schoolId,query],ctx=>studentsRepo.accessList(ctx,schoolId,query));
  return <SchoolSourceState query={q}>{d=><AccessDirectoryBody d={d} schoolId={schoolId} list={list} scopedQuery={Boolean(params.get('studentId')||params.get('yearId'))}/>}</SchoolSourceState>;
}
function AccessDirectoryBody({d,schoolId,list,scopedQuery}:{d:Directory;schoolId:string;list:ReturnType<typeof useListQuery>;scopedQuery:boolean}){
  const router=useRouter(),base=`/school/${schoolId}`,[issue,setIssue]=useState(false),[reissue,setReissue]=useState<Row|null>(null),[revoke,setRevoke]=useState<ParentLinkRevokeTarget|null>(null);
  const label=(row:Row)=>`Link cấp cho ${row.relation.toLowerCase()} (${row.guardianName}) — em ${row.studentName}`;
  const columns:Column<Row>[]=[
    {key:'student',header:'Học sinh',sortable:true,cell:row=><span className="block min-w-[160px]"><Link href={`${base}/students/${row.studentId}`} className="font-semibold text-ink hover:underline">{row.studentName}</Link><span className="block text-[12px] text-muted">{row.studentCode} · {row.className}</span></span>},
    {key:'guardian',header:'Cấp cho',cell:row=><span className="block min-w-[150px]"><span className="block font-medium text-ink">{row.relation}</span><span className="block text-[12px] text-muted">{row.guardianName}</span></span>},
    {key:'year',header:'Năm học',hideBelow:'lg',cell:row=>row.yearLabel},{key:'status',header:'Trạng thái',cell:row=><StatusBadge status={row.status} map={ACCESS_STATUS}/>},
    {key:'issuedAt',header:'Ngày cấp',sortable:true,hideBelow:'md',cell:row=><span className="tabular-nums">{fmtDate(row.issuedAt)}</span>},{key:'expires',header:'Hạn',cell:row=><span className="tabular-nums">{fmtDate(row.expiresAt)}</span>},
    {key:'modules',header:'Phạm vi',hideBelow:'lg',cell:row=><span title={row.modules.map(m=>parentModuleLabel[m]).join(', ')}>{row.modules.length}/8 mục</span>},
    {key:'opens',header:'Lượt mở',sortable:true,align:'right',cell:row=><span className="tabular-nums">{row.opens}{row.lastOpenedAt&&<span className="block text-[11.5px] text-muted">{fmtDate(row.lastOpenedAt)}</span>}</span>},
    {key:'act',header:<span className="sr-only">Thao tác</span>,align:'center',cell:row=><ActionMenu label={`Thao tác với ${label(row)}`} items={[
      {label:'Xem chi tiết và nhật ký',icon:<Eye/>,href:`${base}/parent-access/${row.id}`},...(row.canPreview?[{label:'Xem trước trang phụ huynh',icon:<MonitorSmartphone/>,href:`${base}/parent-access/${row.id}/preview`}]:[]),
      ...(row.canRevoke?[{label:'Thu hồi',icon:<Ban/>,danger:true,separatorBefore:true,onSelect:()=>setRevoke(revokeTarget(row,label(row)))}]:[]),...(row.canIssue?[{label:'Cấp lại',icon:<RefreshCw/>,separatorBefore:true,hint:'Thu hồi link này và cấp link mới',onSelect:()=>setReissue(row)}]:[])]}/>}
  ];
  return <div className="page"><PageHeader title="Quyền tra cứu phụ huynh" subtitle="Mỗi dòng là một link riêng: một người giám hộ, một học sinh, một năm học. Nhật ký ghi việc sử dụng link, không chứng minh danh tính người đang xem."
    actions={d.canIssue?<Button variant="primary" icon={<Link2 className="size-4"/>} onClick={()=>setIssue(true)}>Cấp link mới</Button>:undefined}/>
    <div className="grid gap-3 sm:grid-cols-3"><KpiCard label="Đang hoạt động" value={fmtNumber(d.kpi.active)} icon={<CheckCircle2 className="size-7"/>} tone="green" hint="Còn hạn và có quyền nhận thông tin"/><KpiCard label="Hết hạn" value={fmtNumber(d.kpi.expired)} icon={<Clock className="size-7"/>} tone="neutral" hint="Cần cấp lại nếu còn cần xem"/><KpiCard label="Đã thu hồi" value={fmtNumber(d.kpi.revoked)} icon={<Ban className="size-7"/>} tone="pink" hint="Bao gồm quan hệ không còn quyền nhận"/></div><p className="text-[12.5px] text-muted">Các chỉ số tính trên toàn bộ link trong phạm vi quản lý. Bộ lọc áp dụng cho danh sách bên dưới.</p>
    {scopedQuery&&<Callout tone="info">Đang lọc theo học sinh và năm học đã chọn. <ButtonLink size="sm" href={`${base}/parent-access`}>Xem toàn bộ phạm vi</ButtonLink></Callout>}
    <Card><CardHeader title={`Danh sách link (${d.total})`} icon={<Link2 className="size-5"/>}/><FilterBar q={list.query.q??''} onQ={list.setQ} placeholder="Tìm theo học sinh, mã hoặc người giám hộ…" onReset={list.reset} active={list.active}>
      <InlineSelect label="Lọc trạng thái" allLabel="Tất cả trạng thái" value={list.query.filters?.status??''} onChange={value=>list.setFilter('status',value)} options={Object.entries(ACCESS_STATUS).map(([value,status])=>({value,label:status.label}))}/>
      <InlineSelect label="Lọc theo lớp" allLabel="Tất cả lớp" value={list.query.filters?.classId??''} onChange={value=>list.setFilter('classId',value)} options={d.classes.map(c=>({value:c.id,label:`${c.name} · ${c.yearName}`}))}/>
    </FilterBar>{d.total===0&&!list.active?<EmptyState icon={<Link2 className="size-6"/>} title="Chưa có link nào trong phạm vi" description="Cấp link riêng cho người giám hộ đã xác minh và được phép nhận thông tin." action={d.canIssue?<Button variant="primary" size="sm" onClick={()=>setIssue(true)}>Cấp link</Button>:undefined}/>:<>
      <DataTable columns={columns} rows={d.items} rowKey={row=>row.id} sort={list.query.sort} dir={list.query.dir} onSort={list.setSort} empty={<EmptyFiltered onReset={list.reset}/>} onRowClick={row=>router.push(`${base}/parent-access/${row.id}`)}/>
      <Pagination page={d.page} pageCount={d.pageCount} pageSize={d.pageSize} total={d.total} onPage={list.setPage} onPageSize={list.setPageSize} what="link"/>
    </>}</Card>{issue&&<IssueAccessDialog open onOpenChange={o=>{if(!o)setIssue(false);}} schoolId={schoolId}/>} {reissue&&<IssueAccessDialog open onOpenChange={o=>{if(!o)setReissue(null);}} schoolId={schoolId} studentId={reissue.studentId} relationshipId={reissue.relationshipId} replace={replacement(reissue,label(reissue))}/>}<RevokeAccessDialog target={revoke} onClose={()=>setRevoke(null)} schoolId={schoolId}/></div>;
}
export function AccessDetailPage({schoolId,accessId}:{schoolId:string;accessId:string}){
  const q=useRepo(['parent-access',schoolId,accessId],ctx=>studentsRepo.access(ctx,schoolId,accessId));
  return <SchoolSourceState query={q}>{d=><AccessDetailBody d={d} schoolId={schoolId}/>}</SchoolSourceState>;
}
function AccessDetailBody({d,schoolId}:{d:Details;schoolId:string}){
  const a=d.access,base=`/school/${schoolId}`,who=`Link cấp cho ${d.relationship.relation.toLowerCase()} (${d.guardian.fullName})`,[reissue,setReissue]=useState<ParentLinkReplacement|null>(null),[revoke,setRevoke]=useState<ParentLinkRevokeTarget|null>(null);
  const eventsList=useListQuery({pageSize:10}),events=useRepo(['parent-access-history',schoolId,a.id,eventsList.query],ctx=>studentsRepo.accessEvents(ctx,schoolId,a.id,eventsList.query));
  const eventLabels:Record<string,string>={EXCHANGED:'Mở phiên tra cứu',READ:'Đọc thông tin',BLOCKED:'Bị chặn',REVOKED:'Bị thu hồi',EXPIRED:'Hết hạn',DOWNLOAD:'Tải tài liệu'};
  return <div className="page"><PageHeader title="Chi tiết quyền tra cứu" subtitle={who} badge={<StatusBadge status={a.status} map={ACCESS_STATUS}/>} actions={<><ButtonLink href={`${base}/parent-access`}>Danh sách link</ButtonLink>
    {a.canPreview&&<ButtonLink href={`${base}/parent-access/${a.id}/preview`} icon={<MonitorSmartphone className="size-4"/>}>Xem trước trang phụ huynh</ButtonLink>}
    {a.canRevoke&&<Button variant="danger-soft" icon={<Ban className="size-4"/>} onClick={()=>setRevoke(revokeTarget(a,who))}>Thu hồi</Button>}{a.canIssue&&<Button variant="primary" icon={<RefreshCw className="size-4"/>} onClick={()=>setReissue(replacement(a,who))}>Cấp lại</Button>}
  </>}/>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"><div className="min-w-0 space-y-5"><Card><CardHeader title="Thông tin quyền" icon={<KeyRound className="size-5"/>}/><div className="grid gap-x-8 px-5 pb-4 sm:grid-cols-2"><dl>
      <InfoRow label="Người được cấp">{d.relationship.relation} — {d.guardian.fullName}</InfoRow><InfoRow label="Điện thoại">{d.canViewContact?d.guardian.phoneMasked??'Chưa có số liên hệ':'Không có quyền xem liên hệ'}</InfoRow>
      <InfoRow label="Học sinh"><Link href={`${base}/students/${d.student.id}`} className="hover:underline">{d.student.fullName}</Link><span className="font-normal text-muted"> ({d.student.code} · {d.student.className})</span></InfoRow><InfoRow label="Năm học">{d.yearLabel}</InfoRow></dl><dl>
      <InfoRow label="Ngày cấp">{fmtDateTime(a.issuedAt)}</InfoRow><InfoRow label="Người cấp">{d.issuedByName??'Chưa có tên hiển thị'}</InfoRow><InfoRow label="Hạn sử dụng">{fmtDateTime(a.expiresAt)}</InfoRow><InfoRow label="Lượt sử dụng link">{a.opens}</InfoRow></dl></div>
      {a.revokedAt&&<div className="mx-5 mb-4"><Callout tone="danger" icon={<Ban/>} title={`Đã thu hồi lúc ${fmtDateTime(a.revokedAt)}${d.revokedByName?` — ${d.revokedByName}`:''}`}>{a.revokeReason}{d.replacedBy&&<> · <Link href={`${base}/parent-access/${d.replacedBy}`} className="font-semibold underline">Xem link thay thế</Link></>}</Callout></div>}
      {a.status==='revoked'&&!a.revokedAt&&<div className="mx-5 mb-4"><Callout tone="warning">Quan hệ giám hộ không còn quyền nhận thông tin; link hiện bị chặn.</Callout></div>}
      <div className="px-5 pb-5"><p className="mb-2 text-sm font-semibold text-ink">Mục được xem ({a.modules.length}/8)</p><div className="flex flex-wrap gap-1.5">{(Object.keys(parentModuleLabel) as ParentModule[]).map(m=><span key={m} className={`chip ${a.modules.includes(m)?'chip-active':'opacity-60 line-through'}`}>{parentModuleLabel[m]}</span>)}</div><p className="mt-2 text-[12.5px] text-muted">{a.allowDownload?'Được tải tài liệu đã công bố.':'Không được tải tài liệu.'} Muốn đổi phạm vi: cấp lại link.</p></div></Card></div>
      <div className="min-w-0 space-y-5"><Card><CardHeader title="Link và mã QR" icon={<QrCode className="size-5"/>}/><div className="space-y-3 px-5 pb-5"><Callout tone="info" icon={<Info/>}>Link và QR chỉ hiển thị khi cấp. Hồ sơ đã lưu không trả lại mã truy cập riêng.</Callout>{a.canIssue&&<Button icon={<RefreshCw className="size-4"/>} onClick={()=>setReissue(replacement(a,who))}>Cấp lại để nhận link mới</Button>}<Callout tone="warning" icon={<AlertTriangle/>}>Chỉ trao link riêng cho người được cấp. Người có link có thể dùng quyền xem trong thời hạn.</Callout></div></Card>
        <Card><CardHeader title="Link khác của học sinh" icon={<Link2 className="size-5"/>} subtitle="Thu hồi link này không ảnh hưởng link của người giám hộ khác."/><ul className="divide-y divide-line px-5 pb-4">{!d.siblings.length&&<li className="py-2 text-[13px] text-muted">Không có link khác trong năm học này.</li>}{d.siblings.map(link=><li key={link.id} className="flex items-center gap-3 py-2 text-[13px]"><span className="flex-1">{link.relation} — {link.guardianName}</span><StatusBadge status={link.status} map={ACCESS_STATUS}/><Link href={`${base}/parent-access/${link.id}`} className="card-link">Mở</Link></li>)}</ul>{d.siblingsHasMore&&<p className="px-5 pb-4 text-sm text-muted">Đang hiển thị 20/{d.siblingsTotal} link. <Link href={`${base}/parent-access?studentId=${d.student.id}&yearId=${a.yearId}`} className="card-link">Xem danh sách của học sinh</Link></p>}</Card>
      </div></div>
    <Card><CardHeader title="Nhật ký sử dụng link" icon={<Eye className="size-5"/>} subtitle="Sự kiện sử dụng link không xác minh ai đang cầm link."/><SchoolSourceState query={events}>{page=><>
      {!page.total?<EmptyState compact title="Chưa có sự kiện"/>:<div className="table-wrap"><table className="table" style={{minWidth:640}}><thead><tr><th>Thời gian</th><th>Sự kiện</th><th>Nội dung xem</th><th>Thiết bị</th></tr></thead><tbody>{page.items.map(event=><tr key={event.id}><td className="whitespace-nowrap tabular-nums">{fmtDateTime(event.at)}</td><td>{eventLabels[event.eventKind]??event.eventKind}</td><td>{event.module===null?'—':event.module==='overview'?'Trang tổng quan':parentModuleLabel[event.module as ParentModule]??event.module}</td><td className="text-muted">{event.device??'—'}</td></tr>)}</tbody></table></div>}
      <Pagination page={page.page} pageCount={page.pageCount} pageSize={page.pageSize} total={page.total} onPage={eventsList.setPage} what="sự kiện"/>
    </>}</SchoolSourceState></Card>{reissue&&<IssueAccessDialog open onOpenChange={o=>{if(!o)setReissue(null);}} schoolId={schoolId} studentId={d.student.id} relationshipId={reissue.relationshipId} replace={reissue}/>}<RevokeAccessDialog target={revoke} onClose={()=>setRevoke(null)} schoolId={schoolId}/>
  </div>;
}
