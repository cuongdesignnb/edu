"use client";
import {useState} from 'react';
import {http} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import {useRepo} from '@/lib/query/hooks';
import {useClassroom} from '@/features/classroom/context';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/form';
const labels={publicPortalEnabled:'Bật cổng lớp công khai',publicStudentConductEnabled:'Công khai kết quả thi đua đã công bố',publicStudentAttendanceEnabled:'Công khai chuyên cần đã công bố',publicStudentActivitiesEnabled:'Công khai hoạt động đã công bố',publicRankingEnabled:'Công khai xếp hạng',publicSeatingEnabled:'Công khai sơ đồ đang áp dụng'};
export function PublicPortalSettings(){
 const {schoolId,classId,can}=useClassroom(),[open,setOpen]=useState(false),[form,setForm]=useState<ApiSchemas['ClassPublicPortalSettings']|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const q=useRepo(['class-public-portal',schoolId,classId],async()=>{const data=(await http('getClassPublicPortalSettings',{params:{schoolId,classId}})).data;return data;},{enabled:open});
 const value=form??q.data,url=value?.slug&&typeof window!=='undefined'?`${window.location.origin}/lop/${value.slug}`:'';
 const save=async(rotateSlug=false)=>{if(!value)return;setBusy(true);setError('');try{const {version,slug,...flags}=value;void slug;const saved=(await http('saveClassPublicPortalSettings',{params:{schoolId,classId},body:{...flags,expectedVersion:version,rotateSlug}})).data;setForm(saved);await q.refetch();}catch(e){setError(e instanceof Error?e.message:'Chưa lưu được');}finally{setBusy(false);}};
 const qr=async()=>{if(!url)return;const QR=await import('qrcode'),data=await QR.toDataURL(url,{width:800,margin:2});const a=document.createElement('a');a.href=data;a.download='qr-cong-lop.png';a.click();};
 if(!(can('parentAccess.issue')||can('parentAccess.manage.all')))return null;
 return <><Button onClick={()=>{setOpen(true);setForm(null);}}>Cổng lớp công khai & QR</Button><Modal open={open} onOpenChange={setOpen} title="Cổng lớp công khai & QR" busy={busy} footer={<Button variant="primary" onClick={()=>void save()} loading={busy}>Lưu cấu hình</Button>}>
 <div className="space-y-4"><p className="text-sm">Mọi người có link hoặc QR đều xem được. Các mục thông tin học sinh mặc định tắt. QR chỉ chứa địa chỉ cổng lớp.</p>{error&&<p role="alert">{error}</p>}{value&&Object.entries(labels).map(([key,label])=><Checkbox key={key} label={label} checked={value[key as keyof typeof labels]} onChange={checked=>setForm({...value,[key]:checked})}/>)}
 {url&&<><input aria-label="Link cổng lớp" className="input w-full" readOnly value={url}/><div className="flex flex-wrap gap-2"><Button onClick={()=>void navigator.clipboard.writeText(url)}>Sao chép link</Button><Button onClick={()=>void qr()}>Tải QR</Button><a className="btn" href={url} target="_blank" rel="noreferrer">Xem trước</a><Button disabled={busy} onClick={()=>{if(window.confirm('Đổi link sẽ vô hiệu QR và link cũ. Tiếp tục?'))void save(true);}}>Đổi link công khai</Button></div></>}</div></Modal></>;
}
