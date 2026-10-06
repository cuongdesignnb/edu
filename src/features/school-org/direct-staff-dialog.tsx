"use client";
import {useEffect,useState} from 'react';
import {UserPlus} from 'lucide-react';
import {staffRepo,passwordErrors} from '@/lib/repositories';
import {useCommand,useRepo} from '@/lib/query/hooks';
import {useOptionalSchool} from '@/components/layout/shells';
import {readStaffContext} from '@/lib/api/session';
import {hasSchoolApiAction} from '@/lib/api/permissions';
import {QuickCreate} from '@/features/forms/quick-create';
import {PickerState} from '@/features/forms/picker-state';
import {validPickerValue} from '@/lib/query/form-options';
import type {ApiSchemas} from '@/lib/api/generated';
import {Modal} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Callout} from '@/components/ui/card';
import {TextField,Checkbox,RadioGroup,ErrorSummary,SelectField} from '@/components/ui/form';
import {PasswordField,PasswordRules} from '@/features/auth/password-field';
import {useDirtyClose} from './common';

export function DirectStaffDialog({open,onClose,schoolId,schoolName,onCreated}:{open:boolean;onClose:()=>void;schoolId:string;schoolName:string;onCreated:(value:ApiSchemas['DirectStaff'])=>void|Promise<void>}){
 const school=useOptionalSchool(),context=readStaffContext(),canAssign=!!context&&hasSchoolApiAction(context,schoolId,'assignment.manage');
 const [mode,setMode]=useState<'new'|'existing'>('new'),[name,setName]=useState(''),[email,setEmail]=useState('');
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[force,setForce]=useState(true),[confirmed,setConfirmed]=useState(false);
 const [from,setFrom]=useState(''),[until,setUntil]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 const options=useRepo(['direct-staff-options',schoolId,open],ctx=>staffRepo.invitationOptions(ctx,schoolId),{enabled:open});
 const [yearId,setYearId]=useState('');
 const assignmentOptions=useRepo(['direct-staff-assignment-options',schoolId],ctx=>staffRepo.assignmentOptions(ctx,schoolId),{enabled:open&&canAssign});
 const classes=useRepo(['school-assignment-classes',schoolId,yearId],ctx=>staffRepo.assignmentClasses(ctx,schoolId,yearId),{enabled:open&&canAssign&&!!yearId});
 const [kind,setKind]=useState(''),[classId,setClassId]=useState(''),[subjectId,setSubjectId]=useState(''),[startsOn,setStartsOn]=useState(''),[endsOn,setEndsOn]=useState(''),[reason,setReason]=useState('');
 const [role,setRole]=useState(''),[department,setDepartment]=useState('');
 useEffect(()=>{if(open){setYearId(school?.yearId??'');setRole('');setDepartment('');setKind('');setClassId('');setSubjectId('');setStartsOn('');setEndsOn('');setReason('');setMode('new');setName('');setEmail('');setPassword('');setConfirm('');setForce(true);setConfirmed(false);setFrom('');setUntil('');setErrors({});}},[open]);
 useEffect(()=>{if(assignmentOptions.data&&!validPickerValue(yearId,assignmentOptions.data.years)){setYearId('');setClassId('');}if(assignmentOptions.data&&!validPickerValue(subjectId,assignmentOptions.data.subjects))setSubjectId('');},[assignmentOptions.data,yearId,subjectId]);
 useEffect(()=>{if(classes.data&&!classes.isFetching&&!validPickerValue(classId,classes.data))setClassId('');},[classes.data,classes.isFetching,classId]);
 const chooseYear=(id:string)=>{setYearId(id);setClassId('');setStartsOn('');setEndsOn('');};
 const dirty=open&&!!(name||email||password||role||department||kind||from||until);
 const close=()=>{setPassword('');setConfirm('');onClose();};
 const {beforeClose,confirmNode,requestClose}=useDirtyClose(dirty,close);
 const create=useCommand((ctx,input:ApiSchemas['DirectStaffCreate'])=>staffRepo.createStaffAccount(ctx,schoolId,input),{silentError:true,onError:e=>setErrors(e.fieldErrors??{form:e.message})});
 const assign=useCommand((ctx,input:ApiSchemas['DirectStaffAssign'])=>staffRepo.assignExistingStaff(ctx,schoolId,input),{silentError:true,onError:e=>setErrors(e.fieldErrors??{form:e.message})});
 const existing=create.error?.details?.problemCode==='IDENTITY_EXISTS_USE_ASSIGN',busy=create.pending||assign.pending;
 const changeMode=(v:'new'|'existing')=>{setMode(v);setPassword('');setConfirm('');setConfirmed(false);setErrors({});create.reset();assign.reset();};
 const submit=async()=>{
  const e:Record<string,string>={};if(name.trim().length<3)e.displayName='Họ tên tối thiểu 3 ký tự';if(!/^\S+@\S+\.\S+$/.test(email.trim()))e.email='Email chưa hợp lệ';
  if(mode==='new')Object.assign(e,passwordErrors(password,confirm));else if(!confirmed)e.confirmed='Xác nhận gán tài khoản hiện có cho trường này';
  if(from&&!Number.isFinite(Date.parse(from)))e.validFrom='Hiệu lực từ chưa hợp lệ';if(until&&(!Number.isFinite(Date.parse(until))||Date.parse(until)<=Date.parse(from||new Date().toISOString())))e.validUntil='Hiệu lực đến phải sau thời điểm bắt đầu';
  if(kind&&(!yearId||!classId||!startsOn||kind==='SUBJECT'&&!subjectId))e.assignment='Chọn năm học, lớp, ngày bắt đầu và môn nếu dạy bộ môn';if(kind&&(classes.error||assignmentOptions.error||!classes.data?.some(c=>c.id===classId)))e.assignment='Tải lại lựa chọn lớp hợp lệ trước khi phân công';if(!role)e.roleId='Chọn vai trò trong trường';setErrors(e);if(Object.keys(e).length)return;
  const fields={displayName:name.trim(),email:email.trim().toLowerCase(),roleId:role,department:department.trim(),...(kind?{assignment:{kind:kind as 'HOMEROOM'|'SUBJECT',classId,startsOn,...(endsOn?{endsOn}:{}),...(kind==='SUBJECT'&&subjectId?{subjectId}:{}),...(reason?{reason}:{})}}:{}),...(from?{validFrom:new Date(from).toISOString()}:{}),validUntil:until?new Date(until).toISOString():null};
  try{const value=mode==='new'?await create.run({...fields,password,mustChangePassword:force}):await assign.run(fields);if(value){await onCreated(value);onClose();}}
  finally{setPassword('');setConfirm('');}
 };
 return <><Modal open={open} onOpenChange={v=>{if(!v){setPassword('');setConfirm('');onClose();}}} busy={busy} title="Tạo tài khoản giáo viên" description={schoolName} size="md" beforeClose={beforeClose}
  footer={<><Button onClick={requestClose} disabled={busy}>Hủy</Button><Button variant="primary" icon={<UserPlus className="size-4"/>} loading={busy} onClick={submit}>{mode==='new'?'Tạo tài khoản':'Gán tài khoản hiện có'}</Button></>}>
  <div className="space-y-4"><Callout tone="info">Tài khoản và quyền được tạo trực tiếp. Không gửi email và không phụ thuộc SMTP.</Callout>
   <RadioGroup label="Phương thức" value={mode} onChange={changeMode} options={[{value:'new',label:'Tạo tài khoản mới',disabled:busy},{value:'existing',label:'Gán tài khoản hiện có',disabled:busy}]}/>
   <ErrorSummary errors={errors} labels={{displayName:'Họ và tên',email:'Email',password:'Mật khẩu',confirm:'Xác nhận mật khẩu',confirmed:'Xác nhận gán',validFrom:'Hiệu lực từ',validUntil:'Hiệu lực đến',form:'Tài khoản'}}/>
   {existing&&<Button onClick={()=>changeMode('existing')}>Gán tài khoản hiện có</Button>}
   <TextField label="Họ và tên" required value={name} onChange={e=>setName(e.target.value)} disabled={busy} error={errors.displayName}/>
   <PickerState query={options} empty={!!options.data&&!options.data.roles.some(r=>r.canDelegate&&r.code!=="SCHOOL_ADMIN")} emptyText="Chưa có vai trò được phép cấp cho giáo viên. Kiểm tra mẫu quyền với quản trị trường."/>
   <SelectField label="Vai trò" required value={role} disabled={busy||options.isLoading||!!options.error} onChange={e=>setRole(e.target.value)} options={[{value:"",label:"Chọn vai trò"},...(options.data?.roles??[]).filter(r=>r.canDelegate&&r.code!=="SCHOOL_ADMIN").map(r=>({value:r.id,label:r.label}))]} error={errors.roleId}/>
   <TextField label="Bộ phận" value={department} onChange={e=>setDepartment(e.target.value)} disabled={busy}/>
   <SelectField label="Phân công ngay (không bắt buộc)" value={kind} disabled={busy||!canAssign} onChange={e=>{setKind(e.target.value);setClassId('');setSubjectId('');}} options={[{value:'',label:'Chưa phân công lớp/môn'},{value:'HOMEROOM',label:'Giáo viên chủ nhiệm'},{value:'SUBJECT',label:'Giáo viên bộ môn'}]}/>
   {kind&&<div className="space-y-3">
    <PickerState query={assignmentOptions} empty={!!assignmentOptions.data&&!assignmentOptions.data.years.length} emptyText="Chưa có năm học được phép phân công."/>
    <SelectField label="Năm học" required value={yearId} placeholder="Chọn năm học" disabled={busy||assignmentOptions.isLoading||!!assignmentOptions.error} onChange={e=>chooseYear(e.target.value)} labelAction={<QuickCreate kind="year" schoolId={schoolId} onCreated={async r=>{const fresh=await assignmentOptions.refetch();if(fresh.error)throw fresh.error;if(!fresh.data?.years.some(y=>y.id===r.id))throw new Error("Đã tạo năm học nhưng chưa thuộc lựa chọn được phép phân công.");chooseYear(r.id);}} disabled={busy}/>} options={(assignmentOptions.data?.years??[]).map(y=>({value:y.id,label:`${y.label}${y.status==='draft'?' (Nháp)':''}`}))}/>
    <SelectField label="Lớp" required value={classId} disabled={busy||!yearId||classes.isLoading||!!classes.error} onChange={e=>setClassId(e.target.value)} placeholder={yearId?'Chọn lớp':'Chọn năm học trước'} labelAction={<QuickCreate kind="class" schoolId={schoolId} yearId={yearId} disabled={busy||!yearId} onCreated={async r=>{const result=await classes.refetch();if(result.error)throw result.error;if(r.yearId===yearId&&result.data?.some(c=>c.id===r.id))setClassId(r.id);else setErrors(old=>({...old,assignment:'Lớp đã tạo không thuộc năm học đang chọn. Hãy chọn lại năm học phù hợp.'}));}}/>} options={(classes.data??[]).map(c=>({value:c.id,label:`${c.name}${c.status==='draft'?' (Nháp)':''}`}))}/>
    {yearId&&<PickerState query={classes} empty={!!classes.data&&!classes.data.length} emptyText={`Chưa có lớp trong năm học ${assignmentOptions.data?.years.find(y=>y.id===yearId)?.label??"đang chọn"}.`}/>}
    {kind==='SUBJECT'&&<SelectField label="Môn học" required value={subjectId} disabled={busy||assignmentOptions.isLoading||!!assignmentOptions.error} onChange={e=>setSubjectId(e.target.value)} placeholder="Chọn môn" labelAction={<QuickCreate kind="subject" schoolId={schoolId} disabled={busy} onCreated={async r=>{const result=await assignmentOptions.refetch();if(result.error)throw result.error;if(result.data?.subjects.some(s=>s.id===r.id))setSubjectId(r.id);}}/>} options={(assignmentOptions.data?.subjects??[]).map(c=>({value:c.id,label:c.name}))}/>}
    <TextField label="Phân công từ ngày" type="date" value={startsOn} onChange={e=>setStartsOn(e.target.value)}/><TextField label="Phân công đến ngày (loại trừ)" type="date" value={endsOn} onChange={e=>setEndsOn(e.target.value)}/><TextField label="Lý do (bắt buộc nếu lùi ngày)" value={reason} onChange={e=>setReason(e.target.value)}/>
   </div>}

   <TextField label="Email đăng nhập" type="email" required value={email} onChange={e=>{setEmail(e.target.value);setConfirmed(false);}} disabled={busy} error={errors.email}/>
   {mode==='new'?<><PasswordField id="direct-staff-password" label="Mật khẩu tạm thời" required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} error={errors.password} autoComplete="new-password"/><PasswordRules value={password}/><PasswordField id="direct-staff-confirm" label="Xác nhận mật khẩu" required value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy} error={errors.confirm} autoComplete="new-password"/><Checkbox label="Bắt buộc đổi mật khẩu khi đăng nhập lần đầu" checked={force} onChange={setForce} disabled={busy}/></>:<><Callout tone="warning">Chỉ gán tài khoản đang hoạt động, chưa thuộc trường. Giữ nguyên mật khẩu và danh tính toàn hệ thống.</Callout><Checkbox label={`Tôi xác nhận gán ${email||'tài khoản hiện có'} vào ${schoolName}`} checked={confirmed} onChange={setConfirmed} disabled={busy}/></>}
   <div className="grid gap-4 sm:grid-cols-2"><TextField label="Hiệu lực từ" type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} disabled={busy} error={errors.validFrom} helper="Để trống: có hiệu lực ngay"/><TextField label="Hiệu lực đến" type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)} disabled={busy} error={errors.validUntil} helper="Không bắt buộc"/></div>
  </div>
 </Modal>{confirmNode}</>;
}
