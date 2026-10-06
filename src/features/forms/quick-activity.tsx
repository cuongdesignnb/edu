"use client";
import {useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {useQueryClient} from '@tanstack/react-query';
import {useClassroom} from '@/features/classroom/context';
import {refreshFormOptions} from '@/lib/query/form-options';
import {Button} from '@/components/ui/button';
import {ConfirmDialog,Modal} from '@/components/ui/dialog';
const ActivityFormPage=dynamic(()=>import('@/features/activities/activity-form').then(m=>m.ActivityFormPage));
export function QuickActivity({onCreated}:{onCreated:(row:{id:string;name:string})=>void|Promise<void>}){
 const {schoolId,can,readOnly}=useClassroom(),client=useQueryClient(),trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[dirty,setDirty]=useState(false),[discard,setDiscard]=useState(false),[error,setError]=useState('');
 const close=()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());};
 const requestClose=()=>{if(dirty)setDiscard(true);else close();};
 const saved=async(row:{id:string;name:string})=>{try{await refreshFormOptions(client,schoolId);await onCreated(row);setError('');}catch(e){setError(e instanceof Error?e.message:'Đã tạo hoạt động. Chưa tải được lựa chọn mới.');}close();};
 if(readOnly||!can('activity.manage'))return null;
 return <><Button ref={trigger} variant="ghost" size="sm" onClick={()=>{setDirty(false);setError('');setOpen(true);}}>+ Tạo hoạt động</Button>{error&&<p role="alert" className="error-text">{error}</p>}<Modal open={open} size="xl" title="Tạo hoạt động" beforeClose={()=>{if(dirty){setDiscard(true);return false;}return true;}} onOpenChange={o=>{if(!o)requestClose();}}>{open&&<ActivityFormPage embedded onDirtyChange={setDirty} onCancel={requestClose} onCreated={saved}/>}</Modal><ConfirmDialog open={discard} onOpenChange={setDiscard} title="Bỏ hoạt động chưa lưu?" consequence="Thông tin trong biểu mẫu ghi nhận minh chứng bên dưới được giữ nguyên." confirmLabel="Bỏ nội dung" variant="danger" onConfirm={()=>{setDiscard(false);close();}}/></>;
}
