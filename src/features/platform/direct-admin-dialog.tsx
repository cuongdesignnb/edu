"use client";
import {useEffect,useState} from 'react';
import {UserPlus} from 'lucide-react';
import {platformRepo,passwordErrors} from '@/lib/repositories';
import {useCommand} from '@/lib/query/hooks';
import type {ApiSchemas} from '@/lib/api/generated';
import {Modal} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Callout} from '@/components/ui/card';
import {TextField,Checkbox,RadioGroup,ErrorSummary} from '@/components/ui/form';
import {PasswordField,PasswordRules} from '@/features/auth/password-field';
import {useLeaveGuard,useUnsavedChanges} from '@/components/ui/guards';

export function DirectAdminDialog({open,onClose,schoolId,schoolName,onCreated}:{open:boolean;onClose:()=>void;schoolId:string;schoolName:string;onCreated:(value:ApiSchemas['DirectSchoolAdmin'])=>void}){
 const [mode,setMode]=useState<'new'|'existing'>('new'),[name,setName]=useState(''),[email,setEmail]=useState('');
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[force,setForce]=useState(true),[confirmed,setConfirmed]=useState(false);
 const [from,setFrom]=useState(''),[until,setUntil]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 useEffect(()=>{if(open){setMode('new');setName('');setEmail('');setPassword('');setConfirm('');setForce(true);setConfirmed(false);setFrom('');setUntil('');setErrors({});}},[open]);
 const dirty=open&&!!(name||email||password),leave=useLeaveGuard();useUnsavedChanges(dirty);
 const create=useCommand((ctx,input:ApiSchemas['DirectSchoolAdminCreate'])=>platformRepo.createSchoolAdmin(ctx,schoolId,input),{onError:e=>setErrors(e.fieldErrors??{form:e.message})});
 const assign=useCommand((ctx,input:ApiSchemas['AssignExistingSchoolAdmin'])=>platformRepo.assignExistingAdmin(ctx,schoolId,input),{onError:e=>setErrors(e.fieldErrors??{form:e.message})});
 const existing=create.error?.details?.problemCode==='IDENTITY_EXISTS_USE_ASSIGN',busy=create.pending||assign.pending;
 const changeMode=(v:'new'|'existing')=>{setMode(v);setPassword('');setConfirm('');setConfirmed(false);setErrors({});create.reset();assign.reset();};
 const submit=async()=>{
  const e:Record<string,string>={};if(name.trim().length<3)e.displayName='Họ tên tối thiểu 3 ký tự';if(!/^\S+@\S+\.\S+$/.test(email.trim()))e.email='Email chưa hợp lệ';
  if(mode==='new')Object.assign(e,passwordErrors(password,confirm));else if(!confirmed)e.confirmed='Xác nhận gán tài khoản hiện có cho trường này';
  if(from&&!Number.isFinite(Date.parse(from)))e.validFrom='Hiệu lực từ chưa hợp lệ';if(until&&(!Number.isFinite(Date.parse(until))||Date.parse(until)<=Date.parse(from||new Date().toISOString())))e.validUntil='Hiệu lực đến phải sau thời điểm bắt đầu';
  setErrors(e);if(Object.keys(e).length)return;
  const fields={displayName:name.trim(),email:email.trim().toLowerCase(),validFrom:from?new Date(from).toISOString():null,validUntil:until?new Date(until).toISOString():null};
  try{const value=mode==='new'?await create.run({...fields,password,mustChangePassword:force}):await assign.run(fields);if(value){onCreated(value);onClose();}}
  finally{setPassword('');setConfirm('');}
 };
 return <Modal open={open} onOpenChange={v=>{if(!v){setPassword('');setConfirm('');onClose();}}} busy={busy} title="Tạo tài khoản quản trị" description={schoolName} size="md" beforeClose={()=>{if(!dirty)return true;leave(()=>{setPassword('');setConfirm('');onClose();});return false;}}
  footer={<><Button onClick={()=>{setPassword('');setConfirm('');onClose();}} disabled={busy}>Hủy</Button><Button variant="primary" icon={<UserPlus className="size-4"/>} loading={busy} onClick={submit}>{mode==='new'?'Tạo tài khoản':'Gán tài khoản hiện có'}</Button></>}>
  <div className="space-y-4"><Callout tone="info">Tài khoản và quyền được tạo trực tiếp. Không gửi email và không phụ thuộc SMTP.</Callout>
   <RadioGroup label="Phương thức" value={mode} onChange={changeMode} options={[{value:'new',label:'Tạo tài khoản mới',disabled:busy},{value:'existing',label:'Gán tài khoản hiện có',disabled:busy}]}/>
   <ErrorSummary errors={errors} labels={{displayName:'Họ và tên',email:'Email',password:'Mật khẩu',confirm:'Xác nhận mật khẩu',confirmed:'Xác nhận gán',validFrom:'Hiệu lực từ',validUntil:'Hiệu lực đến',form:'Tài khoản'}}/>
   {existing&&<Button onClick={()=>changeMode('existing')}>Gán tài khoản hiện có</Button>}
   <TextField label="Họ và tên" required value={name} onChange={e=>setName(e.target.value)} disabled={busy} error={errors.displayName}/>
   <TextField label="Email đăng nhập" type="email" required value={email} onChange={e=>{setEmail(e.target.value);setConfirmed(false);}} disabled={busy} error={errors.email}/>
   {mode==='new'?<><PasswordField id="direct-admin-password" label="Mật khẩu tạm thời" required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} error={errors.password} autoComplete="new-password"/><PasswordRules value={password}/><PasswordField id="direct-admin-confirm" label="Xác nhận mật khẩu" required value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy} error={errors.confirm} autoComplete="new-password"/><Checkbox label="Bắt buộc đổi mật khẩu khi đăng nhập lần đầu" checked={force} onChange={setForce} disabled={busy}/></>:<><Callout tone="warning">Chỉ gán tài khoản đang hoạt động, chưa thuộc trường. Giữ nguyên mật khẩu và danh tính toàn hệ thống.</Callout><Checkbox label={`Tôi xác nhận gán ${email||'tài khoản hiện có'} làm quản trị ${schoolName}`} checked={confirmed} onChange={setConfirmed} disabled={busy}/></>}
   <div className="grid gap-4 sm:grid-cols-2"><TextField label="Hiệu lực từ" type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} disabled={busy} error={errors.validFrom} helper="Để trống: có hiệu lực ngay"/><TextField label="Hiệu lực đến" type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)} disabled={busy} error={errors.validUntil} helper="Không bắt buộc"/></div>
  </div>
 </Modal>;
}
