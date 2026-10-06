"use client";
import {useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {useQueryClient} from '@tanstack/react-query';
import {useClassroom} from '@/features/classroom/context';
import {classroomRepo} from '@/lib/repositories';
import {useRepo} from '@/lib/query/hooks';
import {refreshFormOptions} from '@/lib/query/form-options';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/dialog';
import {QueryState} from '@/components/ui/states';
const OrganizationDrawer=dynamic(()=>import('@/features/class-org/groups').then(m=>m.OrganizationDrawer));
export function QuickOrganization({kind,onCreated}:{kind:'group'|'position';onCreated?:(id:string)=>void|Promise<void>}){
 const {schoolId,yearId,classId,can,readOnly}=useClassroom(),client=useQueryClient(),trigger=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false),[error,setError]=useState('');
 const q=useRepo(['class-groups',schoolId,yearId,classId],ctx=>classroomRepo.groups(ctx,schoolId,yearId,classId),{enabled:open});
 const close=()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());};
 if(readOnly||!can('groups.manage'))return null;
 return <><Button ref={trigger} size="sm" variant="ghost" onClick={()=>{setError('');setOpen(true);}}>+ Tạo {kind==='group'?'tổ':'chức vụ'}</Button>{error&&<p role="alert" className="error-text">{error}</p>}{open&&(q.data&&!q.error?<OrganizationDrawer kind={kind} d={q.data} onClose={close} onSaved={async id=>{try{await refreshFormOptions(client,schoolId);await onCreated?.(id);}catch(e){setError(e instanceof Error?e.message:"Đã tạo dữ liệu nhưng chưa tải được lựa chọn mới.");}close();}}/>:<Modal open onOpenChange={o=>{if(!o)close();}} title={kind==='group'?'Tạo tổ':'Tạo chức vụ'}><QueryState query={q} skeleton="form">{()=>null}</QueryState></Modal>)}</>;
}
