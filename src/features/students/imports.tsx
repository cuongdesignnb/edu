"use client";
import {QuickCreate} from "@/features/forms/quick-create";
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Upload,Download,FileSpreadsheet,FileText,GraduationCap,Users,School as SchoolIcon,CalendarDays,History,ArrowRight,ShieldCheck} from 'lucide-react';
import {studentsRepo,studentsExtraRepo,type ImportKind,type ImportKindInfo} from '@/lib/repositories';
import type {ApiSchemas} from '@/lib/api/generated';
import {useCommand,useRepo} from '@/lib/query/hooks';
import {fmtDateTime,fmtNumber} from '@/lib/formatters';
import {downloadBlob,downloadCSV,downloadXLSX} from '@/lib/export';
import {readStaffContext} from '@/lib/api/session';
import {uiActions} from '@/lib/api/permissions';
import {useSchool} from '@/components/layout/shells';
import {PageHeader} from '@/components/layout/page';
import {KpiCard} from '@/components/data/kpi';
import {Card,CardHeader,Callout,InfoRow} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Button,ButtonLink} from '@/components/ui/button';
import {InlineSelect,RadioGroup,SelectField} from '@/components/ui/form';
import {FileDropzone} from '@/components/ui/file';
import {Stepper} from '@/components/ui/progress';
import {useUnsavedChanges} from '@/components/ui/guards';
import {DeniedState,EmptyFiltered,EmptyState,ErrorState,QueryState,Skeleton} from '@/components/ui/states';
import {DataTable,FilterBar,Pagination,useClientList,type Column} from '@/components/data/table';

function canImport(schoolId:string){const context=readStaffContext(),member=context?.memberships.find(m=>m.schoolId===schoolId);return !!context&&!!member&&member.grants.some(g=>uiActions(context,{schoolId,classId:g.classId,subjectId:g.subjectId}).has('import.run'));}
const KIND_ICON: Record<ImportKind, React.ReactNode> = { students: <GraduationCap className="size-6" />, teachers: <Users className="size-6" />, classes: <SchoolIcon className="size-6" />, timetable: <CalendarDays className="size-6" /> };
const KIND_TONE: Record<ImportKind, "blue" | "green" | "amber" | "purple"> = { students: "blue", teachers: "purple", classes: "green", timetable: "amber" };

async function downloadTemplate(k:ImportKindInfo,fmt:'csv'|'xlsx'){
 const cols=k.columns.map(c=>({key:c.key,label:c.key}));
 if(fmt==='csv')downloadCSV(cols,[],`mau-nhap-${k.kind}.csv`);
 else await downloadXLSX(cols,[],`mau-nhap-${k.kind}.xlsx`);
}

/* ------------------------------ SC26 — import center ------------------------------ */
export function ImportsCenter({ schoolId }: { schoolId: string }) {
  useSchool();
  const allowed=canImport(schoolId);
  const base = `/school/${schoolId}`;
  const kinds = useRepo(["import-kinds", schoolId], (ctx) => studentsExtraRepo.importKinds(ctx, schoolId), { enabled:allowed });
  const hist = useRepo(["imports", schoolId], (ctx) => studentsRepo.imports(ctx, schoolId), { enabled:allowed });
  const [status, setStatus] = useState("");
  const rows = useMemo(() => (hist.data ?? []).filter((i) => !status || (status === "errors" ? i.summary.invalid > 0 : i.summary.invalid === 0)), [hist.data, status]);
  const list = useClientList(rows, { search: (r) => `${r.fileName} ${r.id} ${r.className} ${r.createdByName}`, pageSize: 8 });
  if (!allowed) return <div className="page"><DeniedState message="Bạn không có quyền nhập dữ liệu từ tệp." /></div>;
  type H = NonNullable<typeof hist.data>[number];
  const columns: Column<H>[] = [
    { key: "file", header: "Tệp", cell: (r) => <Link href={`${base}/imports/${r.id}`} className="block min-w-[180px] hover:underline"><span className="block font-semibold text-ink">{r.fileName}</span><span className="block text-[12px] text-muted">{r.id}</span></Link> },
    { key: "kind", header: "Loại", hideBelow: "md", cell: (r) => ({STUDENTS:"Học sinh",STAFF:"Giáo viên",CLASSES:"Lớp",TIMETABLE:"Lịch học"})[r.kind] },
    { key: "class", header: "Lớp nhận", cell: (r) => r.className },
    { key: "counts", header: "Kết quả", cell: (r) => <span className="flex flex-wrap gap-1"><Badge tone="success">+{r.summary.added}</Badge>{r.summary.updated > 0 && <Badge tone="info">{r.summary.updated} cập nhật</Badge>}{r.summary.skipped > 0 && <Badge tone="neutral">{r.summary.skipped} bỏ qua</Badge>}{r.summary.invalid > 0 && <Badge tone="danger">{r.summary.invalid} lỗi</Badge>}</span> },
    { key: "by", header: "Người nhập", hideBelow: "lg", cell: (r) => <span className="text-[13px]">{r.createdByName}<span className="block text-[12px] text-muted">{fmtDateTime(r.createdAt)}</span></span> },
    { key: "open", header: <span className="sr-only">Mở</span>, align: "right", cell: (r) => <Link href={`${base}/imports/${r.id}`} className="card-link">Kết quả</Link> },
  ];
  return (
    <div className="page">
      <PageHeader title="Trung tâm nhập dữ liệu" subtitle="Nhập CSV/XLSX; kiểm tra và xem trước trước khi nhập dữ liệu."
        breadcrumbs={[{ label: "Nhà trường", href: base }, { label: "Nhập dữ liệu" }]} illustration="/assets/illustrations/girl-clipboard.png"
        actions={<ButtonLink href={`${base}/imports/new`} variant="primary" icon={<Upload className="size-4" />}>Nhập dữ liệu</ButtonLink>} />
      {kinds.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
        : kinds.error ? <ErrorState error={kinds.error} onRetry={() => kinds.refetch()} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kinds.data!.map((k) => (
              <Card key={k.kind} className="flex flex-col p-5">
                <div className="flex items-center gap-3"><span className={`icon-tile tone-${KIND_TONE[k.kind]}`} aria-hidden>{KIND_ICON[k.kind]}</span><div><p className="text-[16px] font-bold text-ink">{k.title}</p>{!k.enabled && <Badge tone="neutral">Không có quyền nhập loại này</Badge>}</div></div>
                <p className="mt-3 text-[13.5px] text-body">{k.description}</p>
                <p className="mt-2 text-[12.5px] text-muted">Cột: {k.columns.map((c) => c.label + (c.required ? "*" : "")).join(", ")}</p>
                {!k.enabled && <p className="mt-2 rounded-lg bg-neutral-bg px-3 py-2 text-[12.5px] text-neutral-text">Bạn cần quyền quản lý dữ liệu tương ứng để nhập loại này.</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button size="sm" icon={<FileText className="size-4" />} onClick={() => downloadTemplate(k, "csv")}>Mẫu CSV</Button>
                  <Button size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => downloadTemplate(k, "xlsx")}>Mẫu XLSX</Button>
                  {k.enabled && <ButtonLink size="sm" variant="primary" href={`${base}/imports/new`} iconRight={<ArrowRight className="size-4" />}>Bắt đầu</ButtonLink>}
                </div>
              </Card>
            ))}
          </div>
        )}
      <Card>
        <CardHeader title="Lịch sử nhập" icon={<History className="size-5" />} subtitle="Mỗi lô có trạng thái và kết quả xử lý; mã nghiệp vụ và preview được kiểm tra trước khi ghi." />
        <FilterBar q={list.q} onQ={list.setQ} placeholder="Tìm theo tên tệp, mã lô, lớp…" onReset={() => { list.setQ(""); setStatus(""); }} active={!!list.q || !!status}>
          <InlineSelect label="Lọc kết quả" allLabel="Tất cả lần nhập" value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={[{ value: "errors", label: "Có dòng lỗi" }, { value: "clean", label: "Không lỗi" }]} />
        </FilterBar>
        {hist.isLoading ? <div className="space-y-2 px-4 pb-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : hist.error ? <ErrorState error={hist.error} onRetry={() => hist.refetch()} compact />
          : !hist.data!.length ? <EmptyState compact icon={<Upload className="size-6" />} title="Chưa có lần nhập nào" action={<ButtonLink href={`${base}/imports/new`} size="sm" variant="primary">Nhập danh sách</ButtonLink>} />
          : (
            <>
              <div className="px-4"><DataTable caption="Lịch sử nhập" rows={list.items} columns={columns} rowKey={(r) => r.id} empty={<EmptyFiltered onReset={() => { list.setQ(""); setStatus(""); }} what="lần nhập" />} minWidth={720} /></div>
              <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} onPage={list.setPage} what="lần nhập" />
            </>
          )}
      </Card>
    </div>
  );
}

/* ------------------------------ SC27/SC28 — persisted import workflow ------------------------------ */
const STEPS = ["Tệp", "Ghép cột", "Kiểm tra", "Xem trước", "Nhập"];
const JOB_LABEL:Record<string,string>={UPLOADED:'Đã tải tệp',VALIDATING:'Đang kiểm tra',READY:'Đã kiểm tra',APPLYING:'Đang nhập',COMPLETED:'Hoàn tất',FAILED:'Thất bại',CANCELLED:'Đã hủy'};

export function ImportWizard({schoolId}:{schoolId:string}){
 useSchool();const allowed=canImport(schoolId),router=useRouter();
 const catalog=useRepo(['import-workspace',schoolId],ctx=>studentsRepo.importWorkspace(ctx,schoolId),{enabled:allowed});
 const [kind,setKind]=useState<ImportKind>('students'),[yearId,setYearId]=useState(''),[classId,setClassId]=useState(''),[file,setFile]=useState<File>();
 useEffect(()=>{const query=new URLSearchParams(window.location.search);setYearId(query.get('yearId')??'');setClassId(query.get('classId')??'');},[]);
 const upload=useCommand((ctx,k:ApiSchemas['ImportCreate']['kind'],y:string,cl:string|undefined,f:File)=>studentsRepo.uploadImport(ctx,schoolId,k,y,cl,f),{success:'Đã tạo lô nhập; đang phân tích tệp',onSuccess:j=>router.push(`/school/${schoolId}/imports/${j.id}`)});
 useUnsavedChanges(!!file&&!upload.pending);
 if(!allowed)return <div className="page"><DeniedState message="Bạn không có quyền nhập dữ liệu từ tệp." /></div>;
 return <QueryState query={catalog} skeleton="detail">{d=>{
  const selected=d.kinds.find(k=>k.kind===kind)!,y=yearId||d.years.find(y=>y.status==='ACTIVE')?.id||d.years[0]?.id||'',classes=d.classes.filter(c=>c.yearId===y),needsClass=kind==='students'||kind==='timetable';
  return <div className="page"><PageHeader title="Nhập dữ liệu" subtitle="Chọn loại dữ liệu, tải tệp và kiểm tra kết quả trước khi xác nhận nhập." breadcrumbs={[{label:'Nhập dữ liệu',href:`/school/${schoolId}/imports`},{label:'Tạo lô nhập'}]} /><Card className="p-4"><Stepper steps={STEPS} current={0} /></Card><Card><CardHeader title="Bước 1 — Chọn loại, phạm vi và tệp" icon={<Upload className="size-5" />} /><div className="space-y-4 px-5 pb-5"><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Loại dữ liệu" value={kind} onChange={e=>{setKind(e.target.value as ImportKind);setClassId('');}} options={d.kinds.map(k=>({value:k.kind,label:k.title,disabled:!k.enabled}))} /><SelectField label="Năm học" labelAction={<QuickCreate kind="year" schoolId={schoolId} onCreated={async r=>{const fresh=await catalog.refetch();if(fresh.error)throw fresh.error;if(!fresh.data?.years.some(y=>y.id===r.id))throw new Error('Đã tạo năm học nhưng chưa hợp lệ cho luồng nhập dữ liệu.');setYearId(r.id);setClassId('');}}/>} required value={y} onChange={e=>{setYearId(e.target.value);setClassId('');}} options={d.years.map(y=>({value:y.id,label:y.name}))} /></div>{needsClass&&<SelectField label="Lớp nhận" labelAction={<QuickCreate kind="class" schoolId={schoolId} yearId={y} onCreated={async r=>{const fresh=await catalog.refetch();if(fresh.data?.classes.some(c=>c.id===r.id&&c.yearId===y))setClassId(r.id);else throw new Error("Đã tạo lớp nhưng chưa hợp lệ cho loại nhập và năm học đang chọn.");}}/>} required value={classId} onChange={e=>setClassId(e.target.value)} placeholder="Chọn lớp" options={classes.map(c=>({value:c.id,label:`${c.name} (${c.code})`}))} />}<p className="text-sm text-body">{selected.description}</p><FileDropzone accept={['.csv','.xlsx']} maxBytes={2*1024*1024} onFiles={files=>setFile(files[0])} disabled={upload.pending} label="Kéo thả CSV/XLSX hoặc bấm để chọn" />{file&&<p className="text-sm">{file.name} · {file.size} byte</p>}<div className="flex flex-wrap gap-2"><Button icon={<FileText className="size-4" />} onClick={()=>downloadTemplate(selected,'csv')}>Mẫu CSV</Button><Button icon={<FileSpreadsheet className="size-4" />} onClick={()=>downloadTemplate(selected,'xlsx')}>Mẫu XLSX</Button></div>{upload.error&&<Callout tone="warning">{upload.error.message}</Callout>}<div className="flex justify-end"><Button variant="primary" loading={upload.pending} disabled={!file||!y||needsClass&&!classId||!selected.enabled} iconRight={<ArrowRight className="size-4" />} onClick={()=>file&&upload.run(selected.apiKind,y,needsClass?classId:undefined,file)}>Tải và phân tích tệp</Button></div></div></Card></div>;
 }}</QueryState>;
}

export function ImportResult({schoolId,importId}:{schoolId:string;importId:string}){
 const catalog=useRepo(['import-workspace',schoolId],ctx=>studentsRepo.importWorkspace(ctx,schoolId));
 const q=useRepo(['import-job',schoolId,importId],ctx=>studentsRepo.importJob(ctx,schoolId,importId),{refetchInterval:q=>{const j=q.state.data;return j&&(['VALIDATING','APPLYING'].includes(j.status)||j.status==='UPLOADED'&&!j.columns?.length)?1200:false;}});
 const rows=useRepo(['import-rows',schoolId,importId,q.data?.version],ctx=>studentsRepo.importRows(ctx,schoolId,importId),{enabled:!!q.data?.columns?.length});
 const [mapping,setMapping]=useState<Record<string,string>>({}),[mode,setMode]=useState<'ADD_ONLY'|'UPSERT_VERIFIED_CODE'>('ADD_ONLY');
 const validate=useCommand((ctx,j:NonNullable<typeof q.data>,m:{sourceColumn:string;targetField:string}[])=>studentsRepo.validateImport(ctx,schoolId,importId,j.version,m,mode),{success:'Đã nhận yêu cầu kiểm tra',onSuccess:()=>q.refetch()});
 const commit=useCommand((ctx,j:NonNullable<typeof q.data>)=>studentsRepo.commitImportJob(ctx,schoolId,importId,j),{success:'Đã nhận yêu cầu nhập; theo dõi kết quả xử lý',onSuccess:()=>q.refetch()});
 const cancel=useCommand((ctx,v:number)=>studentsRepo.cancelImportJob(ctx,schoolId,importId,v),{success:'Đã hủy lô nhập',onSuccess:()=>q.refetch()});
 const errors=useCommand(async(ctx)=>{const f=await studentsRepo.importErrors(ctx,schoolId,importId);ctx.staffOwner!.assertCurrent();downloadBlob(f.blob,f.filename);});
 return <QueryState query={q} skeleton="detail">{j=>{
  const k=catalog.data?.kinds.find(k=>k.apiKind===j.kind),fields=k?.columns??[],columns=j.columns??[],pending=validate.pending||commit.pending||cancel.pending,step=j.status==='COMPLETED'||j.status==='APPLYING'?4:j.status==='READY'?3:j.status==='VALIDATING'?2:columns.length?1:0;
  const mapped=(key:string)=>mapping[key]??(fields.find(f=>f.key===key)?.required?columns.find(c=>c===key||c===fields.find(f=>f.key===key)?.label)??'':'');
  const used=fields.map(f=>({sourceColumn:mapped(f.key),targetField:f.key})).filter(m=>m.sourceColumn),readyMap=fields.filter(f=>f.required).every(f=>mapped(f.key))&&new Set(used.map(m=>m.sourceColumn)).size===used.length;
  const stateError=validate.error??commit.error??cancel.error??errors.error;
  return <div className="page"><PageHeader title={j.status==='COMPLETED'?'Kết quả nhập':'Kiểm tra và nhập dữ liệu'} subtitle={`${j.fileName??'Tệp đã tải'} · ${k?.title??j.kind}${j.className?' → '+j.className:''}`} badge={<Badge tone={j.status==='FAILED'?'danger':j.status==='COMPLETED'?'success':'info'}>{JOB_LABEL[j.status]}</Badge>} breadcrumbs={[{label:'Nhập dữ liệu',href:`/school/${schoolId}/imports`},{label:j.id}]} actions={<ButtonLink href={`/school/${schoolId}/imports/new`} variant="primary">Nhập tệp khác</ButtonLink>} /><Card className="p-4"><Stepper steps={STEPS} current={step} /></Card><div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><KpiCard label="Thêm mới / dự kiến" value={fmtNumber(j.summary.added)} icon={<Upload className="size-7" />} tone="green" /><KpiCard label="Cập nhật / dự kiến" value={fmtNumber(j.summary.updated)} icon={<FileSpreadsheet className="size-7" />} tone="blue" /><KpiCard label="Bỏ qua" value={fmtNumber(j.summary.skipped)} icon={<History className="size-7" />} tone="neutral" /><KpiCard label="Dòng lỗi" value={fmtNumber(j.summary.invalid)} icon={<FileText className="size-7" />} tone="pink" /></div>{stateError&&<Callout tone="warning">{stateError.message}{stateError.code==='CONFLICT'&&<Button size="sm" onClick={()=>q.refetch()}>Tải phiên bản hiện tại</Button>}</Callout>}{catalog.error&&<ErrorState compact error={catalog.error} onRetry={()=>catalog.refetch()} />}
   {j.status==='UPLOADED'&&!columns.length&&<Card className="p-5"><p>Máy chủ đang phân tích tệp; trang tự cập nhật. Reload giữ nguyên lô nhập.</p></Card>}
   {['UPLOADED','READY','FAILED'].includes(j.status)&&columns.length>0&&<Card><CardHeader title="Ghép cột và kiểm tra" icon={<FileSpreadsheet className="size-5" />} /><div className="space-y-4 px-5 pb-5"><div className="grid gap-3 sm:grid-cols-2">{fields.map(f=><SelectField key={f.key} label={f.label} required={f.required} value={mapped(f.key)} onChange={e=>setMapping({...mapping,[f.key]:e.target.value})} placeholder="Không nhập trường này" options={columns.map(c=>({value:c,label:c}))} />)}</div><RadioGroup label="Xử lý mã đã có" value={mode} onChange={setMode} options={[{value:'ADD_ONLY',label:'Chỉ thêm mới'},{value:'UPSERT_VERIFIED_CODE',label:'Thêm và cập nhật theo mã đã đối chiếu'}]} /><Button variant="secondary" loading={validate.pending} disabled={!readyMap||pending||j.summary.processed>0} onClick={()=>validate.run(j,used)}>Kiểm tra trên máy chủ</Button></div></Card>}
   {['VALIDATING','APPLYING'].includes(j.status)&&<Callout tone="info">Máy chủ đang {j.status==='APPLYING'?'ghi dữ liệu':'kiểm tra từng dòng'}. Đã xử lý {j.summary.processed} dòng. Chưa báo hoàn tất trước khi công việc kết thúc.</Callout>}
   {j.status==='FAILED'&&<Callout tone="warning">Lô nhập thất bại. Xem dòng lỗi và số dòng đã xử lý trước khi thử lại; các thay đổi đã ghi được giữ trong kết quả lô.</Callout>}
   <Card><CardHeader title="Dòng dữ liệu và kết quả thật" action={<Button size="sm" icon={<Download className="size-4" />} loading={errors.pending} disabled={!j.summary.invalid} onClick={()=>errors.run()}>Tải dòng lỗi CSV</Button>} /><div className="px-5 pb-5">{rows.isLoading?<Skeleton className="h-28" />:rows.error?<ErrorState error={rows.error} onRetry={()=>rows.refetch()} compact />:!rows.data?.length?<EmptyState compact title="Chưa có dòng được phân tích" />:<div className="table-wrap" role="region" aria-label="Dữ liệu nhập" tabIndex={0}><table className="table" style={{minWidth:620}}><thead><tr><th>Dòng</th><th>Dữ liệu</th><th>Trạng thái</th><th>Kết quả / lỗi</th></tr></thead><tbody>{rows.data.map(r=><tr key={r.rowNumber}><td>{r.rowNumber}</td><td className="max-w-[460px] break-words">{Object.entries(r.values??{}).map(([key,value])=>`${key}: ${value}`).join(' · ')}</td><td>{r.status}</td><td>{r.errors?.map(e=>`${e.field}: ${e.message}`).join('; ')||r.decision||'Chưa kiểm tra'}</td></tr>)}</tbody></table></div>}</div></Card>
   <Card><CardHeader title="Xác nhận và kết quả lô nhập" icon={<ShieldCheck className="size-5" />} /><div className="space-y-3 px-5 pb-5"><dl><InfoRow label="Lô nhập">{j.id}</InfoRow><InfoRow label="Người nhập">{j.createdByName??'Không còn tên công tác'}</InfoRow><InfoRow label="Thời điểm">{fmtDateTime(j.createdAt)}</InfoRow><InfoRow label="Đã xử lý">{j.summary.processed}</InfoRow></dl><Callout tone="info">Chỉ xác nhận bản xem trước đang hiển thị khi không có dòng lỗi. Lịch học nhập thành bản nháp; công bố tại màn thời khóa biểu. Không xóa dữ liệu hiện có.</Callout>{j.status==='READY'&&<Button variant="primary" loading={commit.pending} disabled={pending||j.summary.invalid>0||!j.previewHash} onClick={()=>commit.run(j)}>Xác nhận nhập dữ liệu</Button>}{!['COMPLETED','CANCELLED'].includes(j.status)&&<Button variant="danger-soft" loading={cancel.pending} disabled={pending} onClick={()=>cancel.run(j.version)}>Hủy lô nhập</Button>}{j.status==='COMPLETED'&&<p className="font-semibold text-success-text">Lô đã hoàn tất và dữ liệu đã được lưu.</p>}</div></Card>
  </div>;
 }}</QueryState>;
}
