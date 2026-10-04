"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {Mail,Save,Send} from 'lucide-react';
import type {ApiSchemas} from '@/lib/api/generated';
import {platformRepo} from '@/lib/repositories';
import {useRepo,useCommand} from '@/lib/query/hooks';
import {Card,CardHeader,Callout} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {TextField,NumberField,Toggle,RadioGroup,Checkbox,ErrorSummary} from '@/components/ui/form';
import {QueryState} from '@/components/ui/states';
import {ConflictDialog,useUnsavedChanges} from '@/components/ui/guards';

type Settings=ApiSchemas['PlatformMailSettings'];
const statusLabels:Record<Settings['configurationStatus'],string>={UNCONFIGURED:'Chưa cấu hình SMTP',DISABLED:'SMTP đang tắt',ENABLED_UNVERIFIED:'SMTP đã bật, chưa xác nhận gửi',WORKING:'SMTP hoạt động',ERROR:'SMTP có lỗi'};
export function PlatformMailSettingsCard(){
 const authority=useRepo(['platform-mail-authority'],ctx=>platformRepo.mailAuthority(ctx));
 return <QueryState query={authority} skeleton="form">{allowed=>allowed?<MailQuery/>:<Callout tone="neutral">Cấu hình gửi email chỉ dành cho quản trị nền tảng được cấp quyền quản lý SMTP.</Callout>}</QueryState>;
}
function MailQuery(){
 const q=useRepo(['platform-mail-settings'],ctx=>platformRepo.mailSettings(ctx));
 return <QueryState query={q} skeleton="form">{value=><MailForm value={value} reload={()=>q.refetch()}/>}</QueryState>;
}
function fields(value:Settings){return {enabled:value.enabled,host:value.host,port:value.port,security:value.security,username:value.username,fromEmail:value.fromEmail,fromName:value.fromName};}
function MailForm({value,reload}:{value:Settings;reload:()=>unknown}){
 const [form,setForm]=useState(()=>fields(value)),[password,setPassword]=useState(''),[clearPassword,setClearPassword]=useState(false);
 const [errors,setErrors]=useState<Record<string,string>>({}),[recipient,setRecipient]=useState('');
 const dirty=JSON.stringify(form)!==JSON.stringify(fields(value))||!!password||clearPassword;
 const {enabled,host,port,security,username,fromEmail,fromName}=value;
 useEffect(()=>{setForm({enabled,host,port,security,username,fromEmail,fromName});setPassword('');setClearPassword(false);setErrors({});},[value.version,enabled,host,port,security,username,fromEmail,fromName]);
 useEffect(()=>{if(value.lastTestStatus!=='PENDING')return;const timer=setInterval(()=>void reload(),2500);return ()=>clearInterval(timer);},[value.lastTestStatus,reload]);
 const save=useCommand((ctx,input:ApiSchemas['PlatformMailUpdate'])=>platformRepo.saveMailSettings(ctx,input),{success:'Đã lưu cấu hình gửi email',onError:e=>e.fieldErrors&&setErrors(e.fieldErrors)});
 const test=useCommand((ctx,email:string)=>platformRepo.testMailSettings(ctx,value.version,email),{success:'Đã đưa email kiểm tra vào hàng đợi; chờ worker xác nhận.'});
 const submit=async(event?:FormEvent)=>{
  event?.preventDefault();const next:Record<string,string>={};
  if(form.enabled){if(!form.host.trim())next.host='Nhập SMTP host';if(!form.username.trim())next.username='Nhập username';if(!/^\S+@\S+\.\S+$/.test(form.fromEmail))next.fromEmail='Email gửi chưa hợp lệ';if(!password&&(clearPassword||!value.passwordConfigured))next.password='Nhập mật khẩu để bật gửi email';}
  if(!Number.isInteger(form.port)||form.port<1||form.port>65535)next.port='Port phải từ 1 đến 65535';
  setErrors(next);if(Object.keys(next).length)return false;
  try{const saved=await save.run({...form,expectedVersion:value.version,...(password?{password}:{}),clearPassword});if(saved){setForm(fields(saved));setClearPassword(false);reload();}return !!saved;}
  finally{setPassword('');}
 };
 useUnsavedChanges(dirty,submit);
 const busy=save.pending||test.pending;
 const testDisabled=busy||dirty||!value.enabled||!value.passwordConfigured||value.lastTestStatus==='PENDING'||!/^\S+@\S+\.\S+$/.test(recipient);
 return <Card>
  <CardHeader title="Cấu hình gửi email SMTP" icon={<Mail className="size-5"/>} subtitle={statusLabels[value.configurationStatus]}/>
  <form className="px-5 pb-5" onSubmit={submit} noValidate><fieldset disabled={busy} className="space-y-4">
   <Callout tone="info">Email là tùy chọn. Khi chưa cấu hình hoặc đang tắt, website vẫn hoạt động và email chờ trong hàng đợi. Bật SMTP để worker gửi các thư còn hiệu lực.</Callout>
   <ErrorSummary errors={errors} labels={{host:'Host',username:'Username',fromEmail:'Email gửi',password:'Mật khẩu',port:'Port'}}/>
   <Toggle checked={form.enabled} onChange={enabled=>setForm({...form,enabled})} label="Bật gửi email" disabled={busy}/>
   <div className="grid gap-4 md:grid-cols-2">
    <TextField label="SMTP Host" value={form.host} onChange={e=>setForm({...form,host:e.target.value})} required={form.enabled} error={errors.host}/>
    <NumberField label="Port SMTP" value={form.port} onChange={port=>setForm({...form,port:port??587})} min={1} max={65535} error={errors.port}/>
   </div>
   <RadioGroup label="Bảo mật SMTP" value={form.security} onChange={security=>setForm({...form,security})} options={[{value:'STARTTLS',label:'STARTTLS',description:'Thường dùng port 587',disabled:busy},{value:'TLS',label:'SSL/TLS',description:'Thường dùng port 465',disabled:busy}]} direction="row"/>
   <div className="grid gap-4 md:grid-cols-2">
    <TextField label="SMTP Username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} required={form.enabled} error={errors.username} autoComplete="off"/>
    <TextField label="Mật khẩu SMTP" type="password" value={password} onChange={e=>{setPassword(e.target.value);setClearPassword(false);}} error={errors.password} disabled={clearPassword} autoComplete="new-password" helper={value.passwordConfigured?'Đã lưu mật khẩu. Để trống để giữ nguyên.':'Chưa cấu hình mật khẩu.'}/>
   </div>
   <Checkbox label="Xóa mật khẩu SMTP đã lưu khi lưu cấu hình" checked={clearPassword} onChange={v=>{setClearPassword(v);setPassword('');}} disabled={!value.passwordConfigured} description="Tắt gửi email trước khi xóa mật khẩu."/>
   <div className="grid gap-4 md:grid-cols-2">
    <TextField label="From email" type="email" value={form.fromEmail} onChange={e=>setForm({...form,fromEmail:e.target.value})} required={form.enabled} error={errors.fromEmail}/>
    <TextField label="From name" value={form.fromName} onChange={e=>setForm({...form,fromName:e.target.value})}/>
   </div>
   <div className="flex flex-wrap justify-end gap-2">
    <Button variant="ghost" disabled={!dirty||busy} onClick={()=>{setForm(fields(value));setPassword('');setClearPassword(false);setErrors({});}}>Hủy thay đổi SMTP</Button>
    <Button type="submit" variant="primary" icon={<Save className="size-4"/>} loading={save.pending} disabled={!dirty||test.pending}>Lưu cấu hình SMTP</Button>
   </div>
  </fieldset></form>
  <div className="space-y-3 border-t border-line px-5 py-5">
   <TextField label="Email nhận kiểm tra" type="email" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={busy}/>
   <Button icon={<Send className="size-4"/>} loading={test.pending} disabled={testDisabled} onClick={async()=>{if(await test.run(recipient.trim()))reload();}}>Gửi email kiểm tra</Button>
   <p className="text-sm text-muted" role="status">{value.lastTestStatus==='PENDING'?'Email kiểm tra đang chờ worker xử lý.':value.lastTestStatus==='SENT'?'Email kiểm tra đã gửi thành công.':value.lastTestStatus==='FAILED'?`Gửi email kiểm tra chưa thành công (${value.lastErrorCode??'SMTP_DELIVERY_FAILED'}).`:value.lastTestStatus==='CANCELLED'?'Email kiểm tra đã hủy do cấu hình hoặc quyền thay đổi, hoặc yêu cầu hết hạn.':'Lưu cấu hình đã bật trước khi gửi kiểm tra.'}</p>
  </div>
  <ConflictDialog error={save.error??test.error} onClose={()=>{save.reset();test.reset();}} onReload={()=>{setPassword('');save.reset();test.reset();reload();}}/>
 </Card>;
}
