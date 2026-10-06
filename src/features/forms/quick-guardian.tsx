"use client";
import {canNativeFormAction} from "@/lib/domain/form-permissions";
import {useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import type {ParentIssueSource} from '@/lib/repositories/connected/parent-access-issue';
import {uiActions} from '@/lib/api/permissions';
import {readStaffContext} from '@/lib/api/session';
import {useCtx} from '@/lib/query/hooks';
import {Button} from '@/components/ui/button';
const GuardianDialog=dynamic(()=>import('@/features/students/dialogs').then(m=>m.GuardianDialog));
const VerifyDialog=dynamic(()=>import('@/features/students/dialogs').then(m=>m.VerifyDialog));
export function QuickGuardian({schoolId,source,reload,onSource,onSelect}:{schoolId:string;source:ParentIssueSource;reload:()=>Promise<ParentIssueSource|undefined>;onSource:(source:ParentIssueSource)=>void;onSelect:(id:string)=>void}){
 useCtx(schoolId);const context=readStaffContext(),canManage=!!context&&uiActions(context,{schoolId,classId:source.class.id}).has('guardian.edit');
 const [open,setOpen]=useState(false),[verify,setVerify]=useState<ParentIssueSource['relationships'][number]|null>(null),[message,setMessage]=useState(''),trigger=useRef<HTMLButtonElement>(null);
 const refresh=async()=>{const next=await reload();if(next){onSource(next);return next;}setMessage('Chưa tải được danh sách người giám hộ mới. Hãy thử lại.');};
 if(!canManage)return null;
 return <div className="space-y-2"><Button ref={trigger} size="sm" variant="ghost" onClick={()=>setOpen(true)}>+ Thêm người giám hộ</Button>{message&&<p role="status" className="text-sm text-muted">{message}</p>}
  {source.relationships.filter(r=>r.status==='UNVERIFIED'&&canNativeFormAction(context,schoolId,['guardian.verify'],source.class.id)).map(r=><Button key={r.id} size="sm" onClick={()=>setVerify(r)}>Xác minh {r.guardianName}</Button>)}
  {open&&<GuardianDialog open schoolId={schoolId} studentId={source.student.id} studentName={source.student.fullName} onOpenChange={o=>{setOpen(o);if(!o)requestAnimationFrame(()=>trigger.current?.focus());}} onSaved={async()=>{await refresh();setMessage('Đã thêm liên hệ. Cần xác minh và cho phép nhận thông tin trước khi chọn cấp link.');}}/>}
  <VerifyDialog schoolId={schoolId} target={verify?{relationshipId:verify.id,version:verify.version,to:'verified',guardianName:verify.guardianName,relation:verify.relationshipLabel,studentName:source.student.fullName,activeLinks:verify.activeLinkIds.length}:null} onClose={()=>{const id=verify?.id;setVerify(null);void refresh().then(next=>{if(id&&next?.relationships.some(r=>r.id===id&&r.canIssue)){onSelect(id);setMessage('Người giám hộ đã xác minh và được chọn.');}});}}/>
 </div>;
}
