"use client";
import {useMemo,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {studentsRepo,studentsExtraRepo} from '@/lib/repositories';
import type {ImportJob} from '@/lib/repositories/connected/imports';
import type {ApiSchemas} from '@/lib/api/generated';
import {useCommand,useRepo} from '@/lib/query/hooks';
import {refreshFormOptions} from '@/lib/query/form-options';
import {useToast} from '@/components/ui/toast';
import {Modal} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Callout} from '@/components/ui/card';
import {SelectField,TextField,ErrorSummary} from '@/components/ui/form';
import {PickerState} from '@/features/forms/picker-state';
import {PASTE_FIELDS,parsePaste,mappedRows,previewPaste,type PasteTable,type PasteField} from './paste-parser';

export function StudentPasteDialog({schoolId,initialYearId,initialClassId,onClose}:{schoolId:string;initialYearId?:string;initialClassId?:string;onClose:()=>void}){
 const toast=useToast(),client=useQueryClient(),[yearId,setYear]=useState(initialYearId??''),[classId,setClass]=useState(initialClassId??''),[startsOn,setDate]=useState(''),[text,setText]=useState(''),[table,setTable]=useState<PasteTable|null>(null),[mapping,setMapping]=useState(false),[errors,setErrors]=useState<Record<string,string>>({}),[page,setPage]=useState(0),[job,setJob]=useState<ImportJob|null>(null),[serverRows,setServerRows]=useState<ApiSchemas['ImportRow'][]>([]);
 const choices=useRepo(['student-create-options',schoolId,'paste'],ctx=>studentsExtraRepo.createOptions(ctx,schoolId),{schoolId});
 const today=choices.data?.today??'',classes=choices.data?.classes??[],selected=classes.find(c=>c.id===classId),years=[...new Map(classes.map(c=>[c.yearId,{id:c.yearId,name:c.yearName}])).values()];
 const preview=useMemo(()=>table?previewPaste(mappedRows(table),today):[],[table,today]);
 const failed=(e:{fieldErrors?:Record<string,string>;message:string})=>setErrors(e.fieldErrors??{form:e.message});
 const prepare=useCommand(async(ctx)=>{
  let value=job;
  if(!value){value=await studentsRepo.createStudentPaste(ctx,schoolId,{yearId,classId,startsOn:startsOn||today,rows:preview.map(p=>p.values)});setJob(value);}
  const ready=await studentsRepo.waitImport(ctx,schoolId,value.id,'READY'),rows=await studentsRepo.importRows(ctx,schoolId,value.id);return {ready,rows};
 },{schoolId,success:false,onError:failed});
 const commit=useCommand(async(ctx)=>{
  if(!job)throw new Error('Missing preview');
  if(job.status==='READY'){const applying=await studentsRepo.commitImportJob(ctx,schoolId,job.id,job);setJob(applying);}
  return studentsRepo.waitImport(ctx,schoolId,job.id,'COMPLETED');
 },{schoolId,success:false,onError:failed});
 const busy=prepare.pending||commit.pending,completed=job?.status==='COMPLETED',locked=!!job;
 const reset=()=>{setJob(null);setServerRows([]);setErrors({});setPage(0);};
 const analyze=()=>{try{const parsed=parsePaste(text);reset();setTable(parsed);setMapping(parsed.needsMapping);toast.push({tone:'info',title:`Đã đọc ${parsed.rows.length} dòng`});}catch(e){toast.push({tone:'warning',title:'Chưa phân tích được danh sách',detail:e instanceof Error?e.message:'Kiểm tra nội dung đã dán'});}};
 const validate=async()=>{
  const e:Record<string,string>={};if(!yearId)e.yearId='Hãy chọn năm học';if(!selected||selected.yearId!==yearId)e.classId='Hãy chọn lớp hợp lệ';const day=startsOn||today;if(!day||selected&&(day<selected.yearStartsOn||day>=selected.yearEndsOn))e.startsOn='Ngày vào lớp phải nằm trong năm học';
  if(!table||!Object.values(table.mapping).includes('fullName'))e.rows='Hãy ghép cột Họ và tên';if(!preview.length)e.rows='Chưa có học sinh';
  setErrors(e);if(Object.keys(e).length){toast.push({tone:'error',title:'Danh sách chưa hợp lệ',detail:Object.values(e)[0]});return;}
  const value=await prepare.run();if(value){setJob(value.ready);setServerRows(value.rows);setMapping(false);toast.push({tone:value.ready.summary.invalid?'warning':'success',title:value.ready.summary.invalid?`Có ${value.ready.summary.invalid} dòng cần kiểm tra`:`${value.ready.summary.added} học sinh sẵn sàng thêm`,detail:'Xem kết quả kiểm tra của máy chủ trước khi thêm.'});}
 };
 const save=async()=>{const value=await commit.run();if(value){setJob(value);toast.push({tone:value.summary.invalid?'warning':'success',title:value.summary.invalid?`Đã thêm ${value.summary.added}/${serverRows.length} học sinh`:`Đã thêm ${value.summary.added} học sinh vào lớp ${selected?.name??''}.`,detail:value.summary.invalid?`${value.summary.invalid} dòng cần kiểm tra. Các dòng lỗi được giữ bên dưới.`:undefined});await refreshFormOptions(client,schoolId);}};
 const shown=(serverRows.length?serverRows.map(r=>({...r,values:Object.fromEntries(Object.entries(r.values).map(([k,v])=>[k,String(v??'')]))})):preview.map((p,i)=>({rowNumber:i+1,status:p.errors.length?'INVALID':'VALID',errors:p.errors.map(message=>({field:'row',message})),values:p.values,warnings:p.warnings}))).slice(page*25,(page+1)*25),count=serverRows.length||preview.length;
 return <Modal open onOpenChange={o=>{if(!o)onClose();}} busy={busy} size="xl" title="Dán danh sách học sinh" description="Dán từ Excel, Google Sheets hoặc văn bản. Tối đa 500 học sinh / 200 KB." footer={<><Button disabled={busy} onClick={onClose}>{completed?'Xong':'Đóng'}</Button>{!completed&&table&&<Button disabled={busy} onClick={()=>{reset();setMapping(true);}}>Chỉnh mapping / sửa danh sách</Button>}{!completed&&(job?.status==='READY'?<Button variant="primary" loading={busy} disabled={!job.summary.added} onClick={save}>Thêm {job.summary.added} học sinh</Button>:job?.status==='APPLYING'?<Button variant="primary" loading={busy} onClick={save}>Tải kết quả</Button>:table&&<Button variant="primary" loading={busy} onClick={validate}>{job?'Tải kết quả kiểm tra':'Kiểm tra trên máy chủ'}</Button>)}</>}>
  <div className="space-y-4">
   <ErrorSummary errors={errors} labels={{yearId:'Năm học',classId:'Lớp',startsOn:'Ngày vào lớp',rows:'Danh sách',form:'Nhập học sinh'}}/>
   <PickerState query={choices} empty={!!choices.data&&!classes.length} emptyText="Chưa có lớp được phép thêm học sinh."/>
   <div className="grid gap-3 sm:grid-cols-3"><SelectField data-field="yearId" label="Năm học" value={yearId} disabled={busy||locked||choices.isLoading||!!choices.error} error={errors.yearId} placeholder="Chọn năm học" onChange={e=>{setYear(e.target.value);setClass('');}} options={years.map(y=>({value:y.id,label:y.name}))}/><SelectField data-field="classId" label="Lớp" value={classId} disabled={busy||locked||!yearId||choices.isLoading||!!choices.error} error={errors.classId} placeholder="Chọn lớp" onChange={e=>setClass(e.target.value)} options={classes.filter(c=>c.yearId===yearId).map(c=>({value:c.id,label:c.name}))}/><TextField data-field="startsOn" label="Ngày vào lớp" type="date" value={startsOn||today} disabled={busy||locked||choices.isLoading||!!choices.error} error={errors.startsOn} onChange={e=>setDate(e.target.value)}/></div>
   {!locked&&<><label className="field"><span className="label">Dán từ Excel, Google Sheets hoặc văn bản</span><textarea aria-label="Danh sách học sinh đã dán" className="input min-h-36 w-full" value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder={'Nguyễn Văn An\nTrần Thị Bình'}/></label><Button disabled={busy} onClick={analyze}>Phân tích danh sách</Button></>}
   {table&&mapping&&!locked&&<div className="grid gap-3 sm:grid-cols-2">{table.columns.map((label,i)=><SelectField key={i} label={label} value={table.mapping[i]??''} onChange={e=>setTable({...table,mapping:{...table.mapping,[i]:e.target.value as PasteField|''}})} options={[{value:'',label:'Bỏ qua cột'},...Object.entries(PASTE_FIELDS).map(([value,label])=>({value,label}))]}/>)}<Button onClick={()=>{const fields=Object.values(table.mapping).filter(Boolean);if(!fields.includes('fullName')||new Set(fields).size!==fields.length){toast.push({tone:'error',title:'Ghép cột chưa hợp lệ',detail:'Chọn Họ và tên và không ghép hai cột vào cùng một trường.'});return;}setMapping(false);}}>Xem trước</Button></div>}
   {!!count&&!mapping&&<><Callout tone="info">Mã HS trống được máy chủ tự sinh khi thêm. Trùng tên là hồ sơ riêng. Người giám hộ chưa xác minh và chưa được nhận thông tin.</Callout><p className="text-sm">{count} dòng · {job?.summary.invalid??preview.filter(p=>p.errors.length).length} dòng cần kiểm tra{completed?' · Đã xử lý':''}</p><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr>{['#','Mã HS','Họ tên','Ngày sinh','Giới tính','Trạng thái',''].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{shown.map((r,j)=><tr key={r.rowNumber} className="border-t"><td className="p-2">{r.rowNumber}</td>{(['studentCode','fullName','dateOfBirth','gender'] as const).map(field=><td key={field} className="p-1">{!locked?<input aria-label={`${PASTE_FIELDS[field]} dòng ${r.rowNumber}`} className="input w-full min-w-24" value={r.values[field]??''} placeholder={field==='studentCode'?'Tự sinh khi thêm':undefined} onChange={e=>{if(!table)return;let col=Object.entries(table.mapping).find(([,f])=>f===field)?.[0],columns=table.columns,rows=table.rows.map(row=>[...row]),newMapping=table.mapping;if(col===undefined){col=String(columns.length);columns=[...columns,PASTE_FIELDS[field]];newMapping={...newMapping,[col]:field};rows=rows.map(row=>[...row,'']);}rows[page*25+j]![Number(col)]=e.target.value;setTable({...table,columns,rows,mapping:newMapping});}}/>:r.values[field]||'—'}</td>)}<td className="p-2 text-xs">{r.errors.length?<span className="text-danger-text">{r.errors.map(e=>e.message).join('; ')}</span>:<span>{completed?'ĐÃ THÊM':'SẴN SÀNG'}</span>}{r.warnings?.map(w=><p key={w} className="text-warning">{w}</p>)}</td><td>{!locked&&<Button size="sm" onClick={()=>{if(table)setTable({...table,rows:table.rows.filter((_,i)=>i!==page*25+j)});}} aria-label={`Bỏ dòng ${r.rowNumber}`}>Bỏ</Button>}</td></tr>)}</tbody></table></div><div className="flex items-center gap-3"><Button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Trước</Button><span>{page+1}/{Math.max(1,Math.ceil(count/25))}</span><Button disabled={(page+1)*25>=count} onClick={()=>setPage(p=>p+1)}>Sau</Button></div></>}
  </div>
 </Modal>;
}
