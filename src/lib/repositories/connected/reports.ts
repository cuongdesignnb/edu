import type {ApiSchemas} from '../../api/generated';
import {http,download,captureStaffAccess} from '../../api/client';
import {apiList} from '../../api/lists';
import {exclusiveDate,inclusiveDate} from '../../api/dates';
import {fmtDate} from '../../formatters';
import type {Ctx} from '../core';
import type {ReportData} from '../reports';
import {RepoError} from '../errors';
import {withStaffAccess,displayedVersion} from './common';

const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ báo cáo hoặc tệp xuất.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown)=>typeof v==='string'&&!!v.trim();
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const count=(v:unknown)=>Number.isInteger(v)&&Number(v)>=0;
const types=['attendance','conduct','activities','class-progress','parent-access','student','student-directory'];
const nativeType=(type:string)=>type==='links'?'parent-access':type;
function unique(rows:{id:string}[]){if(new Set(rows.map(r=>r.id)).size!==rows.length)throw invalid();}
function catalogReports(rows:ApiSchemas['ReportCatalogItem'][],classOnly:boolean){
 const allowed=classOnly?['attendance','conduct','activities','student']:['attendance','conduct','activities','class-progress','links'];
 if(!Array.isArray(rows)||rows.length>allowed.length||new Set(rows.map(r=>r.type)).size!==rows.length||rows.some(r=>!allowed.includes(r.type)||!text(r.title)||!text(r.description)))throw invalid();return rows;
}
export function nativeReportCatalog(row:ApiSchemas['ReportCatalog'],schoolId:string,yearId?:string,classId?:string){
 if(row.schoolId!==schoolId||!uuid(schoolId)||row.classId!==(classId??null)||!(row.yearId===null||uuid(row.yearId))||yearId&&row.yearId!==yearId||typeof row.canExport!=='boolean'||!count(row.hiddenCount)||!text(row.role)||!date(row.today)||!Array.isArray(row.students)||row.students.length>5000||!Array.isArray(row.weeks)||row.weeks.length>110||!Array.isArray(row.grades)||row.grades.length>200)throw invalid();
 if(row.yearId===null?(row.yearStart!==null||row.yearEnd!==null||row.canExport||row.weeks.length):( !date(row.yearStart)||!date(row.yearEnd)||row.yearStart!>=row.yearEnd!||row.today<row.yearStart!||row.today>=row.yearEnd!))throw invalid();
 unique(row.students);unique(row.weeks);unique(row.grades);
 if(row.students.some(s=>!uuid(s.id)||!text(s.fullName)||!text(s.code))||row.weeks.some(w=>!uuid(w.id)||!Number.isInteger(w.index)||w.index<1||!date(w.startDate)||!date(w.endDate)||w.startDate>w.endDate)||row.grades.some(g=>!uuid(g.id)||!text(g.name)))throw invalid();
 return {...row,reports:catalogReports(row.reports,!!classId)};
}
type ExportSource=Omit<ApiSchemas['ExportCreate'],'format'>;
export interface NativeReportData extends ReportData {exportSource:ExportSource}
const statuses:Record<string,string>={PRESENT:'Có mặt',LATE:'Đi muộn',EXCUSED:'Nghỉ có phép',UNEXCUSED:'Nghỉ không phép',UNMARKED:'Chưa điểm danh',OPEN:'Đang mở',LOCKED:'Đã chốt',READY:'Đã chốt',PUBLISHED:'Đã công bố',ASSIGNED:'Đã giao',CLOSED:'Đã kết thúc',APPROVED:'Đã duyệt',NEEDS_REVISION:'Cần bổ sung',SUBMITTED:'Chờ duyệt',ACTIVE:'Đang học',DRAFT:'Nháp',ARCHIVED:'Đã lưu trữ',TRANSFERRED:'Đã chuyển',WITHDRAWN:'Đã thôi học',GRADUATED:'Đã tốt nghiệp'};
function scalar(v:unknown):string|number{if(v===null||v===undefined)return '—';if(typeof v==='number'){if(!Number.isFinite(v))throw invalid();return v;}if(typeof v==='boolean')return v?'Có':'Không';if(typeof v==='string')return statuses[v]??v;if(Array.isArray(v))return v.map(scalar).join('; ');if(typeof v==='object')return Object.entries(v).map(([k,value])=>`${k}: ${scalar(value)}`).join('; ');throw invalid();}
export function nativeReport(row:ApiSchemas['Report'],source:{schoolId:string;yearId:string;type:string;classId?:string;params:Record<string,string|undefined>}):NativeReportData{
 const type=nativeType(source.type);if(row.reportType!==type||!types.includes(type)||!timestamp(row.asOf)||!text(row.title)||!text(row.schoolName)||!text(row.yearName)||!text(row.scopeLabel)||!date(row.from)||!date(row.to)||row.from!>=row.to!||!Array.isArray(row.columns)||!row.columns.length||row.columns.length>100||!Array.isArray(row.rows)||row.rows.length>50000||!Array.isArray(row.metrics)||!Array.isArray(row.notes)||row.notes.some(n=>typeof n!=='string')||!['LIVE_INTERNAL','PUBLISHED_SNAPSHOT'].includes(row.dataSource))throw invalid();
 if(new Set(row.columns.map(c=>c.key)).size!==row.columns.length||row.columns.some(c=>!text(c.key)||!text(c.label)))throw invalid();
 const columns=[{key:'label',label:source.classId?'Học sinh / nội dung':'Lớp / nội dung'},...row.columns];
 if(row.columns.some(c=>c.key==='label'||c.key==='_href'))throw invalid();
 const rows=row.rows.map(r=>{if(!text(r.label)||!r.values||typeof r.values!=='object'||r.classId!=null&&!uuid(r.classId)||r.studentId!=null&&!uuid(r.studentId)||source.classId&&r.classId!==source.classId)throw invalid();const values:Record<string,string|number>={label:r.label,...Object.fromEntries(row.columns!.map(c=>[c.key,scalar(r.values[c.key])]))};if(r.classId&&!source.classId)values._href=`/classroom/${source.schoolId}/${source.yearId}/${r.classId}/reports/${source.type}`;return values;});
 const kpis=row.metrics.map(m=>{if(!text(m.label)||typeof m.value!=='number'||!Number.isFinite(m.value)||!(m.denominator===null||typeof m.denominator==='number'&&Number.isFinite(m.denominator)&&m.denominator>=0)||typeof m.unit!=='string'||!timestamp(m.asOf))throw invalid();return {label:m.label,value:`${m.value.toLocaleString('vi-VN')}${m.unit==='%'?'%':''}`,hint:m.denominator===null?undefined:`Mẫu số: ${m.denominator.toLocaleString('vi-VN')}${m.unit&&m.unit!=='%'?` ${m.unit}`:''}`};});
 const p=source.params,exportSource:ExportSource={reportType:type as ExportSource['reportType'],yearId:source.yearId,...(source.classId?{classId:source.classId}:{}),from:row.from!,to:row.to!,scope:source.classId?'CLASS':'SCHOOL',dataSource:row.dataSource,...Object.fromEntries(['gradeId','weekId','studentId'].filter(k=>p[k]).map(k=>[k,p[k]]))};
 return {type:source.type,title:row.title!,subtitle:row.dataSource==='PUBLISHED_SNAPSHOT'?'Bản đã công bố':'Dữ liệu nội bộ tại thời điểm đọc',scopeLabel:`${row.schoolName} — ${source.classId?`lớp ${row.scopeLabel} — `:''}năm học ${row.yearName}`,generatedAt:row.asOf,periodLabel:`${fmtDate(row.from!)} – ${fmtDate(inclusiveDate(row.to!))}`,kpis,columns,rows,notes:row.notes!,exportSource};
}
function query(params:Record<string,string|undefined>,yearId:string){return {...params,yearId,...(params.to?{to:exclusiveDate(params.to)}:{})};}
async function schoolCatalog(schoolId:string,yearId?:string){return nativeReportCatalog((await http('getSchoolReportCatalog',{params:{schoolId},query:{yearId}})).data,schoolId,yearId);}
const jobStatuses={QUEUED:'queued',RUNNING:'running',COMPLETED:'ready',FAILED:'failed',CANCELLED:'cancelled',EXPIRED:'expired'} as const;
export function nativeExport(row:ApiSchemas['ExportJob']){
 if(!uuid(row.id)||!Number.isInteger(row.version)||row.version<1||!timestamp(row.createdAt)||!timestamp(row.updatedAt)||!timestamp(row.expiresAt)||!types.includes(row.reportType)||!['CSV','XLSX','PDF'].includes(row.format)||!(row.status in jobStatuses)||!text(row.title)||!count(row.rowCount)||!row.filters||typeof row.filters!=='object'||Array.isArray(row.filters)||!text(row.fileName)||!uuid(row.requestedBy)||row.classId!=null&&!uuid(row.classId)||row.status==='COMPLETED'&&!uuid(row.fileId))throw invalid();
 const filters=row.filters,params=Object.fromEntries(Object.entries(filters).filter(([,v])=>typeof v==='string').map(([k,v])=>[k,k==='to'?inclusiveDate(v as string):v as string]));
 return {id:row.id!,version:row.version,title:row.title!,fileName:row.fileName!,rowCount:row.rowCount!,format:row.format.toLowerCase() as 'csv'|'xlsx'|'pdf',status:jobStatuses[row.status],expired:row.status==='EXPIRED',expiresAt:row.expiresAt!,createdAt:row.createdAt,createdByName:'Bạn',requestedBy:row.requestedBy!,reportType:row.reportType==='parent-access'?'links':row.reportType,params,classId:row.classId,yearId:typeof filters.yearId==='string'?filters.yearId:undefined,lastErrorCode:row.lastErrorCode};
}
export interface ReportDownload {blob:Blob;filename:string;assertCurrent:()=>void}
async function downloadJob(schoolId:string,id:string):Promise<ReportDownload>{const access=captureStaffAccess(),file=await download('downloadExport',{params:{schoolId,exportId:id}});access.assertCurrent();return {...file,assertCurrent:access.assertCurrent};}
/** Every poll and final file access is reauthorized by the server and remains owned by this staff context. */
export async function createAndDownloadReport(schoolId:string,source:ExportSource,format:'csv'|'xlsx'|'pdf'):Promise<ReportDownload>{
 const access=captureStaffAccess();let job=nativeExport((await http('createExport',{params:{schoolId},body:{...source,format:format.toUpperCase() as 'CSV'|'XLSX'|'PDF'}})).data);access.assertCurrent();
 for(let poll=0;poll<60;poll++){
  if(job.status==='ready')return downloadJob(schoolId,job.id);
  if(['failed','cancelled','expired'].includes(job.status))throw new RepoError(job.status==='expired'?'EXPIRED':'READ_ERROR',job.status==='failed'?`Máy chủ không tạo được tệp${job.lastErrorCode?` (${job.lastErrorCode})`:''}.`:job.status==='cancelled'?'Bản xuất đã được hủy.':'Bản xuất đã hết hạn.');
  await new Promise(r=>setTimeout(r,1000));access.assertCurrent();job=nativeExport((await http('getExport',{params:{schoolId,exportId:job.id}})).data);access.assertCurrent();
 }
 throw new RepoError('READ_ERROR','Bản xuất đang được xử lý. Mở “Các bản xuất” để theo dõi và tải khi hoàn tất.',{details:{exportId:job.id}});
}
export const connectedReportsRepo=withStaffAccess({
 async schoolCatalog(_ctx:Ctx,schoolId:string,yearId?:string){return schoolCatalog(schoolId,yearId);},
 async school(_ctx:Ctx,schoolId:string,type:string,params:Record<string,string|undefined>):Promise<NativeReportData>{const yearId=params.yearId??(await schoolCatalog(schoolId)).yearId;if(!yearId)throw new RepoError('VALIDATION','Trường chưa có năm học để báo cáo.');return nativeReport((await http('getSchoolReport',{params:{schoolId,reportType:nativeType(type)},query:query(params,yearId)})).data,{schoolId,yearId,type,params});},
 async classReport(_ctx:Ctx,schoolId:string,yearId:string,classId:string,type:string,params:Record<string,string|undefined>):Promise<NativeReportData>{return nativeReport((await http('getClassReport',{params:{schoolId,classId,reportType:nativeType(type)},query:query(params,yearId)})).data,{schoolId,yearId,classId,type,params});},
 async teacherCatalog(_ctx:Ctx,schoolId:string){const row=(await http('getTeacherReportCatalog',{params:{schoolId}})).data;if(row.schoolId!==schoolId||!Array.isArray(row.classes)||row.classes.length>500||new Set(row.classes.map(c=>c.classId)).size!==row.classes.length)throw invalid();return row.classes.map(c=>{if(!uuid(c.classId)||!uuid(c.yearId)||!text(c.className)||!text(c.role)||typeof c.canExport!=='boolean')throw invalid();return {...c,reports:catalogReports(c.reports,true)};});},
 async exports(ctx:Ctx,schoolId:string){return (await apiList('listExports',{params:{schoolId},query:{sort:'createdAt',dir:'desc'}},5000)).map(r=>{const job=nativeExport(r);if(ctx.actor.kind!=='staff'||job.requestedBy!==ctx.actor.userId)throw invalid();return job;});},
 async exportReport(_ctx:Ctx,schoolId:string,data:NativeReportData,format:'csv'|'xlsx'|'pdf'){return createAndDownloadReport(schoolId,data.exportSource,format);},
 async downloadExport(_ctx:Ctx,schoolId:string,id:string){return downloadJob(schoolId,id);},
 async cancelExport(_ctx:Ctx,schoolId:string,id:string,version:number){return nativeExport((await http('cancelExport',{params:{schoolId,exportId:id},body:{expectedVersion:displayedVersion(version),reason:'Người tạo hủy bản xuất dữ liệu'}})).data);},
});
export const connectedClassReportCatalogRepo=withStaffAccess({async classReportCatalog(_ctx:Ctx,schoolId:string,yearId:string,classId:string){return nativeReportCatalog((await http('getClassReportCatalog',{params:{schoolId,yearId,classId}})).data,schoolId,yearId,classId);}});
export const connectedStudentExportRepo=withStaffAccess({async exportStudents(_ctx:Ctx,schoolId:string,ids:string[],yearId?:string,format?:'csv'|'xlsx'){
 if(!yearId||!format||!uuid(schoolId))throw invalid();
 if(!uuid(yearId)||!ids.length||ids.length>5000||new Set(ids).size!==ids.length||ids.some(id=>!uuid(id)))throw new RepoError('VALIDATION','Chọn học sinh và năm học trước khi xuất.');
 const cat=await schoolCatalog(schoolId,yearId);if(!cat.yearStart||!cat.yearEnd)throw invalid();return createAndDownloadReport(schoolId,{reportType:'student-directory',yearId,from:cat.yearStart,to:cat.yearEnd,scope:'SCHOOL',studentIds:ids,dataSource:'LIVE_INTERNAL'},format);
}});
