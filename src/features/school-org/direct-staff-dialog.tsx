"use client";
import {useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useToast} from '@/components/ui/toast';
import {FIELD_LABELS,normalizeFieldErrors,commandErrorToast} from '@/lib/query/command-toast';
import {RepoError} from '@/lib/repositories/errors';
import {refreshFormOptions} from '@/lib/query/form-options';
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
import {staffEffectiveDates} from './staff-effective-dates';

export function DirectStaffDialog({open,onClose,schoolId,schoolName,onCreated}:{open:boolean;onClose:()=>void;schoolId:string;schoolName:string;onCreated:(value:ApiSchemas['DirectStaff'])=>void|Promise<void>}){
 const school=useOptionalSchool(),context=readStaffContext(),canAssign=!!context&&hasSchoolApiAction(context,schoolId,'assignment.manage'),toast=useToast(),client=useQueryClient();
 const [mode,setMode]=useState<'new'|'existing'>('new'),[name,setName]=useState(''),[email,setEmail]=useState('');
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[force,setForce]=useState(true),[confirmed,setConfirmed]=useState(false);
 const [errors,setErrors]=useState<Record<string,string>>({});
 const options=useRepo(['direct-staff-options',schoolId,open],ctx=>staffRepo.invitationOptions(ctx,schoolId),{enabled:open});
 const [yearId,setYearId]=useState(''),[profileId,setProfile]=useState('');
 const profiles=useRepo(['teacher-permission-profiles',schoolId],ctx=>staffRepo.permissionProfiles(ctx,schoolId),{enabled:open&&!!context&&hasSchoolApiAction(context,schoolId,'role.read')});
 const assignmentOptions=useRepo(['direct-staff-assignment-options',schoolId],ctx=>staffRepo.assignmentOptions(ctx,schoolId),{enabled:open&&canAssign});
 const classes=useRepo(['school-assignment-classes',schoolId,yearId],ctx=>staffRepo.assignmentClasses(ctx,schoolId,yearId),{enabled:open&&canAssign&&!!yearId});
 const [kind,setKind]=useState(''),[classId,setClassId]=useState(''),[subjectId,setSubjectId]=useState(''),[startsOn,setStartsOn]=useState(''),[endsOn,setEndsOn]=useState(''),[reason,setReason]=useState('');
 const [role,setRole]=useState(''),[department,setDepartment]=useState('');
 useEffect(()=>{if(open){setYearId(school?.yearId??'');setRole('');setDepartment('');setKind('');setProfile('');setClassId('');setSubjectId('');setStartsOn('');setEndsOn('');setReason('');setMode('new');setName('');setEmail('');setPassword('');setConfirm('');setForce(true);setConfirmed(false);setErrors({});}},[open]);
 useEffect(()=>{if(assignmentOptions.data&&!validPickerValue(yearId,assignmentOptions.data.years)){setYearId('');setClassId('');}if(assignmentOptions.data&&!validPickerValue(subjectId,assignmentOptions.data.subjects))setSubjectId('');},[assignmentOptions.data,yearId,subjectId]);
 useEffect(()=>{if(classes.data&&!classes.isFetching&&!validPickerValue(classId,classes.data))setClassId('');},[classes.data,classes.isFetching,classId]);
 const chooseYear=(id:string)=>{setYearId(id);setClassId('');setStartsOn('');setEndsOn('');};
 const dirty=open&&!!(name||email||password||role||department||kind||startsOn||endsOn);
 const close=()=>{setPassword('');setConfirm('');onClose();};
 const {beforeClose,confirmNode,requestClose}=useDirtyClose(dirty,close);
 const failed=(e:RepoError)=>{const fields=Object.fromEntries(Object.entries(normalizeFieldErrors(e.fieldErrors)).map(([k,v])=>[k==='validFrom'?'startsOn':k==='validUntil'?'endsOn':k,v]));setErrors(Object.keys(fields).length?fields:{form:e.message});toast.push({...commandErrorToast(e),title:'Chưa thể tạo tài khoản'});};
 const create=useCommand((ctx,input:ApiSchemas['DirectStaffCreate'])=>staffRepo.createStaffAccount(ctx,schoolId,input),{success:false,silentError:true,onError:failed});
 const assign=useCommand((ctx,input:ApiSchemas['DirectStaffAssign'])=>staffRepo.assignExistingStaff(ctx,schoolId,input),{success:false,silentError:true,onError:failed});
 const existing=create.error?.details?.problemCode==='IDENTITY_EXISTS_USE_ASSIGN',busy=create.pending||assign.pending;
 const changeMode=(v:'new'|'existing')=>{setMode(v);setPassword('');setConfirm('');setConfirmed(false);setErrors({});create.reset();assign.reset();};
 const submit=async()=>{
  const e:Record<string,string>={};if(name.trim().length<3)e.displayName='Họ tên tối thiểu 3 ký tự';if(!/^\S+@\S+\.\S+$/.test(email.trim()))e.email='Email chưa hợp lệ';
  if(mode==='new')Object.assign(e,passwordErrors(password,confirm));else if(!confirmed)e.confirmed='Xác nhận gán tài khoản hiện có cho trường này';
  const membership=context?.memberships.find(m=>m.schoolId===schoolId);
  if(startsOn&&!Number.isFinite(Date.parse(startsOn+'T00:00:00Z')))e.startsOn='Hiệu lực từ chưa hợp lệ';if(endsOn&&(!Number.isFinite(Date.parse(endsOn+'T00:00:00Z'))||endsOn<=(startsOn||membership?.today||'')))e.endsOn='Hiệu lực đến phải sau ngày bắt đầu';
  if(!options.data?.roles.some(r=>r.id===role&&r.canDelegate&&r.code!=='SCHOOL_ADMIN'))e.roleId='Chọn vai trò được phép cấp trong trường';
  if(kind){
   const year=assignmentOptions.data?.years.find(y=>y.id===yearId);
   if(!year)e.yearId='Hãy chọn năm học hợp lệ';
   if(!classId||classes.error||classes.isFetching||!classes.data?.some(c=>c.id===classId))e.classId=`Hãy chọn lớp cho phân công ${kind==='HOMEROOM'?'Giáo viên chủ nhiệm':'Giáo viên bộ môn'}.`;
   if(!startsOn)e.startsOn='Hãy chọn ngày bắt đầu phân công';
   else if(year&&(startsOn<year.startDate||startsOn>year.endDate))e.startsOn=`Ngày bắt đầu phải nằm trong năm học ${year.label}.`;
   if(endsOn&&(endsOn<=startsOn||year&&(endsOn<year.startDate||endsOn>new Date(Date.parse(year.endDate+'T00:00:00Z')+86400000).toISOString().slice(0,10))))e.endsOn='Ngày kết thúc phải sau ngày bắt đầu và thuộc năm học (loại trừ ngày cuối).';
   if(kind==='SUBJECT'&&!assignmentOptions.data?.subjects.some(s=>s.id===subjectId))e.subjectId='Hãy chọn môn học đang hoạt động';
   if(reason&&reason.trim().length<5)e.reason='Lý do tối thiểu 5 ký tự';
  }
  setErrors(e);if(Object.keys(e).length){toast.push({...commandErrorToast(new RepoError('VALIDATION',undefined,{fieldErrors:e})),title:kind&&Object.keys(e).some(k=>['classId','startsOn','endsOn','subjectId','yearId'].includes(k))?'Phân công chưa hợp lệ':'Chưa thể tạo tài khoản'});return;}
  if(!membership?.timezone){failed(new RepoError('READ_ERROR','Chưa tải được múi giờ của trường. Hãy tải lại.'));return;}
  const fields={displayName:name.trim(),email:email.trim().toLowerCase(),roleId:role,department:department.trim(),...(kind?{assignment:{...(profileId?{roleId:profileId}:{}),kind:kind as 'HOMEROOM'|'SUBJECT',classId,startsOn,...(endsOn?{endsOn}:{}),...(kind==='SUBJECT'&&subjectId?{subjectId}:{}),...(reason?{reason}:{})}}:{}),...staffEffectiveDates(startsOn,endsOn,membership!.timezone)};
  const value=mode==='new'?await create.run({...fields,password,mustChangePassword:force}):await assign.run(fields);
  if(value){setPassword('');setConfirm('');toast.push({tone:'success',title:mode==='existing'?'Đã gán tài khoản giáo viên':kind==='HOMEROOM'?`Đã tạo giáo viên và phân công chủ nhiệm lớp ${classes.data?.find(c=>c.id===classId)?.name??''}.`:'Đã tạo tài khoản giáo viên'});try{await refreshFormOptions(client,schoolId);await onCreated(value);close();}catch{toast.push({tone:'warning',title:'Tài khoản đã được tạo',detail:'Chưa tải được danh sách mới. Hãy bấm tải lại; không tạo lại tài khoản.'});close();}}
 };
 return <><Modal open={open} onOpenChange={v=>{if(!v){setPassword('');setConfirm('');onClose();}}} busy={busy} title="Tạo tài khoản giáo viên" description={schoolName} size="md" beforeClose={beforeClose}
  footer={<><Button onClick={requestClose} disabled={busy}>Hủy</Button><Button variant="primary" icon={<UserPlus className="size-4"/>} loading={busy} onClick={submit}>{mode==='new'?'Tạo tài khoản':'Gán tài khoản hiện có'}</Button></>}>
  <div className="space-y-4"><Callout tone="info">Tài khoản và quyền được tạo trực tiếp. Không gửi email và không phụ thuộc SMTP.</Callout>
   <RadioGroup label="Phương thức" value={mode} onChange={changeMode} options={[{value:'new',label:'Tạo tài khoản mới',disabled:busy},{value:'existing',label:'Gán tài khoản hiện có',disabled:busy}]}/>
   <ErrorSummary errors={errors} labels={{...FIELD_LABELS,startsOn:'Hiệu lực từ ngày',endsOn:'Hiệu lực đến ngày'}}/>
   {existing&&<Button onClick={()=>changeMode('existing')}>Gán tài khoản hiện có</Button>}
   <TextField data-field="displayName" label="Họ và tên" required value={name} onChange={e=>setName(e.target.value)} disabled={busy} error={errors.displayName}/>
   <PickerState query={options} empty={!!options.data&&!options.data.roles.some(r=>r.canDelegate&&r.code!=="SCHOOL_ADMIN")} emptyText="Chưa có vai trò được phép cấp cho giáo viên. Kiểm tra mẫu quyền với quản trị trường."/>
   <SelectField data-field="roleId" label="Vai trò" required value={role} disabled={busy||options.isLoading||!!options.error} onChange={e=>setRole(e.target.value)} options={[{value:"",label:"Chọn vai trò"},...(options.data?.roles??[]).filter(r=>r.canDelegate&&r.code!=="SCHOOL_ADMIN").map(r=>({value:r.id,label:r.label}))]} error={errors.roleId}/>
   <TextField label="Bộ phận" value={department} onChange={e=>setDepartment(e.target.value)} disabled={busy}/>
   <SelectField data-field="assignment" label="Phân công ngay (không bắt buộc)" error={errors.assignment} value={kind} disabled={busy||!canAssign} onChange={e=>{setKind(e.target.value);setProfile('');setClassId('');setSubjectId('');setReason('');}} options={[{value:'',label:'Chưa phân công lớp/môn'},{value:'HOMEROOM',label:'Giáo viên chủ nhiệm'},{value:'SUBJECT',label:'Giáo viên bộ môn'}]}/>
   {kind&&<div className="space-y-3">
    {profiles.data&&<SelectField label="Mẫu quyền phân công" value={profileId} onChange={e=>setProfile(e.target.value)} options={[{value:'',label:'Dùng mẫu mặc định của trường'},...profiles.data.roles.filter(r=>r.code!=='SCHOOL_ADMIN'&&r.permissions.some(p=>p.scopes.includes(kind==='HOMEROOM'?'CLASS':'SUBJECT'))).map(r=>({value:r.id!,label:r.label}))]}/>}
    <PickerState query={assignmentOptions} empty={!!assignmentOptions.data&&!assignmentOptions.data.years.length} emptyText="Chưa có năm học được phép phân công."/>
    <SelectField data-field="yearId" error={errors.yearId} label="Năm học" required value={yearId} placeholder="Chọn năm học" disabled={busy||assignmentOptions.isLoading||!!assignmentOptions.error} onChange={e=>chooseYear(e.target.value)} labelAction={<QuickCreate kind="year" schoolId={schoolId} onCreated={async r=>{const fresh=await assignmentOptions.refetch();if(fresh.error)throw fresh.error;if(!fresh.data?.years.some(y=>y.id===r.id))throw new Error("Đã tạo năm học nhưng chưa thuộc lựa chọn được phép phân công.");chooseYear(r.id);}} disabled={busy}/>} options={(assignmentOptions.data?.years??[]).map(y=>({value:y.id,label:`${y.label}${y.status==='draft'?' (Nháp)':''}`}))}/>
    <SelectField data-field="classId" error={errors.classId} label="Lớp" required value={classId} disabled={busy||!yearId||classes.isLoading||!!classes.error} onChange={e=>setClassId(e.target.value)} placeholder={yearId?'Chọn lớp':'Chọn năm học trước'} labelAction={<QuickCreate kind="class" schoolId={schoolId} yearId={yearId} disabled={busy||!yearId} onCreated={async r=>{const result=await classes.refetch();if(result.error)throw result.error;if(r.yearId===yearId&&result.data?.some(c=>c.id===r.id))setClassId(r.id);else setErrors(old=>({...old,assignment:'Lớp đã tạo không thuộc năm học đang chọn. Hãy chọn lại năm học phù hợp.'}));}}/>} options={(classes.data??[]).map(c=>({value:c.id,label:`${c.name}${c.status==='draft'?' (Nháp)':''}`}))}/>
    {yearId&&<PickerState query={classes} empty={!!classes.data&&!classes.data.length} emptyText={`Chưa có lớp trong năm học ${assignmentOptions.data?.years.find(y=>y.id===yearId)?.label??"đang chọn"}.`}/>}
    {kind==='SUBJECT'&&<SelectField data-field="subjectId" error={errors.subjectId} label="Môn học" required value={subjectId} disabled={busy||assignmentOptions.isLoading||!!assignmentOptions.error} onChange={e=>setSubjectId(e.target.value)} placeholder="Chọn môn" labelAction={<QuickCreate kind="subject" schoolId={schoolId} disabled={busy} onCreated={async r=>{const result=await assignmentOptions.refetch();if(result.error)throw result.error;if(result.data?.subjects.some(s=>s.id===r.id))setSubjectId(r.id);}}/>} options={(assignmentOptions.data?.subjects??[]).map(c=>({value:c.id,label:c.name}))}/>}
    <TextField data-field="reason" error={errors.reason} label="Lý do (bắt buộc nếu lùi ngày)" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/>
   </div>}

   <TextField data-field="email" label="Email đăng nhập" type="email" required value={email} onChange={e=>{setEmail(e.target.value);setConfirmed(false);}} disabled={busy} error={errors.email}/>
   {mode==='new'?<><div data-field="password"><PasswordField id="direct-staff-password" label="Mật khẩu tạm thời" required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} error={errors.password} autoComplete="new-password"/></div><PasswordRules value={password}/><div data-field="confirm"><PasswordField id="direct-staff-confirm" label="Xác nhận mật khẩu" required value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy} error={errors.confirm} autoComplete="new-password"/></div><Checkbox label="Bắt buộc đổi mật khẩu khi đăng nhập lần đầu" checked={force} onChange={setForce} disabled={busy}/></>:<><Callout tone="warning">Chỉ gán tài khoản đang hoạt động, chưa thuộc trường. Giữ nguyên mật khẩu và danh tính toàn hệ thống.</Callout><Checkbox label={`Tôi xác nhận gán ${email||'tài khoản hiện có'} vào ${schoolName}`} checked={confirmed} onChange={setConfirmed} disabled={busy}/></>}
   <div className="grid gap-4 sm:grid-cols-2"><TextField data-field="startsOn" label="Hiệu lực từ ngày" type="date" required={!!kind} value={startsOn} onChange={e=>setStartsOn(e.target.value)} disabled={busy} error={errors.startsOn} helper={kind?"Dùng chung cho tài khoản và phân công lớp/môn":"Để trống: tài khoản có hiệu lực ngay"}/><TextField data-field="endsOn" label="Hiệu lực đến ngày (loại trừ)" type="date" value={endsOn} onChange={e=>setEndsOn(e.target.value)} disabled={busy} error={errors.endsOn} helper="Không bắt buộc. Dùng chung cho tài khoản và phân công."/></div>
  </div>
 </Modal>{confirmNode}</>;
}
