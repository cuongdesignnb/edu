"use client";
import {useMemo,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {useQueryClient} from '@tanstack/react-query';
import type {ApiSchemas} from '@/lib/api/generated';
import {readStaffContext} from '@/lib/api/session';
import {useCtx} from '@/lib/query/hooks';
import {refreshFormOptions} from '@/lib/query/form-options';
import {SchoolContextProvider,useOptionalSchool} from '@/components/layout/shells';
import {Button} from '@/components/ui/button';
import {Modal,ConfirmDialog} from '@/components/ui/dialog';

const YearWizard=dynamic(()=>import('@/features/school-org/year-wizard').then(m=>m.YearWizard));
const ItemDialog=dynamic(()=>import('@/features/school-org/dictionaries').then(m=>m.ItemDialog));
const ClassDrawer=dynamic(()=>import('@/features/school-org/class-drawer').then(m=>m.ClassDrawer));
const DirectStaffDialog=dynamic(()=>import('@/features/school-org/direct-staff-dialog').then(m=>m.DirectStaffDialog));
const StudentCreateForm=dynamic(()=>import('@/features/students/student-form').then(m=>m.StudentCreateForm));
import {canQuickCreate,canNativeFormAction,type QuickCreateKind} from '@/lib/domain/form-permissions';
export {canQuickCreate} from '@/lib/domain/form-permissions';
export interface CreatedOption {id:string;yearId?:string;name?:string}
const labels:Record<QuickCreateKind,string>={year:'Tạo năm học',grade:'Thêm khối',room:'Thêm phòng',subject:'Thêm môn',class:'Tạo lớp',teacher:'Tạo giáo viên',student:'Thêm học sinh'};

/** Each child stays inside the mounted parent; success refetches before selecting the new ID. */
export function QuickCreate({kind,schoolId,yearId,classId,onCreated,disabled=false}:{kind:QuickCreateKind;schoolId:string;yearId?:string;classId?:string;onCreated?:(row:CreatedOption)=>void|Promise<void>;disabled?:boolean}){
 useCtx(schoolId);const school=useOptionalSchool(),client=useQueryClient(),trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[discard,setDiscard]=useState(false);
 const requestClose=()=>{if(dirty)setDiscard(true);else close();};
 const beforeClose=()=>{if(dirty){setDiscard(true);return false;}return true;};
 const target=useMemo(()=>open?{mode:'create' as const,yearId}:null,[open,yearId]);
 const close=()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());};
 const saved=async(row:CreatedOption)=>{
  try{await refreshFormOptions(client,schoolId);await onCreated?.(row);setError('');close();}
  catch(e){setError(e instanceof Error?e.message:'Đã tạo dữ liệu nhưng chưa tải được lựa chọn mới. Bấm thử lại ở trường dữ liệu.');close();}
 };
 if(!canQuickCreate(readStaffContext(),kind,schoolId,classId))return null;
 const child=kind==='year'?<Modal open beforeClose={beforeClose} onOpenChange={o=>{if(!o)requestClose();}} title="Tạo năm học" size="xl"><YearWizard embedded onDirtyChange={setDirty} onCancel={requestClose} onCreated={r=>saved({id:r.id,name:r.label})}/></Modal>
  :kind==='grade'||kind==='room'||kind==='subject'?<ItemDialog kind={kind} item="new" onClose={close} onSaved={r=>saved(r)}/>
  :kind==='class'?<ClassDrawer target={target} onClose={close} onSaved={r=>saved(r)}/>
  :kind==='teacher'?<DirectStaffDialog open onClose={close} schoolId={schoolId} schoolName={school?.school.name??''} onCreated={r=>saved({id:r.id,name:r.displayName})}/>
  :<Modal open beforeClose={beforeClose} onOpenChange={o=>{if(!o)requestClose();}} title="Thêm học sinh" size="xl"><StudentCreateForm schoolId={schoolId} initialYearId={yearId} initialClassId={classId} embedded onDirtyChange={setDirty} onCancel={requestClose} onCreated={r=>saved({id:r.id,name:r.fullName,yearId:r.initialEnrollment?.yearId??undefined})}/></Modal>;
 return <><Button ref={trigger} size="sm" variant="ghost" disabled={disabled} onClick={()=>{setError('');setDirty(false);setOpen(true);}}>+ {labels[kind]}</Button>{kind==='student'&&canNativeFormAction(readStaffContext(),schoolId,['import.manage'])&&<a href={`/school/${schoolId}/imports/new`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Import danh sách</a>}{error&&<p role="alert" className="error-text">{error}</p>}{open&&(school?child:<SchoolContextProvider schoolId={schoolId}>{()=>child}</SchoolContextProvider>)}<ConfirmDialog open={discard} onOpenChange={setDiscard} title="Bỏ nội dung chưa lưu?" consequence="Chỉ nội dung trong biểu mẫu tạo nhanh bị bỏ. Biểu mẫu đang mở bên dưới được giữ nguyên." variant="danger" confirmLabel="Bỏ nội dung" onConfirm={()=>{setDiscard(false);close();}}/></>;
}
