"use client";
import {useEffect,useState,useSyncExternalStore} from "react";
import {useQuery} from "@tanstack/react-query";
import {Download,Eye,FileText} from "lucide-react";
import {parentRepo,type RepoError} from "@/lib/repositories";
import {useParent} from "@/features/parent/shell";
import {Modal} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {FilePreview} from "@/components/ui/file";
import {downloadBlob} from '@/lib/export';
import {releaseOwnedBlob} from '@/lib/api/owned-blobs';
import {onStaffAccessChanged,staffAccessRevision} from '@/lib/api/client';
import {EmptyState,Skeleton} from "@/components/ui/states";
import {fmtBytes} from "@/lib/formatters";
import {useToast} from "@/components/ui/toast";
import {keyId} from "./common";

export interface ParentFileMeta {id:string;name:string;mime:string;size:number}
function useFileOwner(){const p=useParent(),revision=useSyncExternalStore(onStaffAccessChanged,staffAccessRevision,staffAccessRevision);return `${p.slug}:${keyId(p.key)}:${p.preview?revision:''}`;}
/** Every open/focus checks the exact current parent view. Every download has a
 * fresh server authorization; a previously viewed blob never grants download. */
export function ParentFileViewer({file,open,onOpenChange}:{file:ParentFileMeta|null;open:boolean;onOpenChange:(o:boolean)=>void}){
 const p=useParent(),download=useSafeDownload(),owner=useFileOwner();
 const q=useQuery<Awaited<ReturnType<typeof parentRepo.file>>,RepoError>({
  queryKey:['parent-file',keyId(p.key),p.slug,owner,file?.id],queryFn:()=>parentRepo.file(p.key,p.slug,file!.id),enabled:open&&!!file,retry:false,staleTime:0,gcTime:0,refetchOnWindowFocus:true,refetchInterval:30_000,
 });
 useEffect(()=>{if(q.error&&q.data)releaseOwnedBlob(q.data.source.blobKey);return()=>{if(q.data)releaseOwnedBlob(q.data.source.blobKey);};},[q.data,q.error]);
 const revoked=q.error?.code==='REVOKED'||q.error?.code==='NOT_FOUND';
 return <Modal open={open} onOpenChange={onOpenChange} size="lg" title={file?.name??'Xem tệp'} description={file?`${fmtBytes(file.size)} · Chỉ xem, tải về khi nhà trường cho phép`:undefined}
  footer={<><Button onClick={()=>onOpenChange(false)}>Đóng</Button>{q.data&&!q.error&&q.data.downloadAllowed&&<Button variant="primary" icon={<Download className="size-4"/>} onClick={()=>download(q.data!.id)}>Tải xuống</Button>}</>}>
  {q.isLoading&&<Skeleton className="h-64 rounded-xl"/>}
  {revoked&&<FilePreview revoked/>}
  {q.error&&!revoked&&<EmptyState compact icon={<FileText className="size-6"/>} title="Không mở được tệp" description={q.error.message}/>}
  {q.data&&!q.error&&<FilePreview file={q.data} allowLocalDownload={false}/>}
 </Modal>;
}
/** Bound before paint so changing the view/preview cannot retain an old title. */
export function useFileViewer(){
 const owner=useFileOwner(),[selection,setSelection]=useState<{file:ParentFileMeta;owner:string}|null>(null);
 const file=selection?.owner===owner?selection.file:null,open=(file:ParentFileMeta)=>setSelection({file,owner});
 return {open,node:<ParentFileViewer file={file} open={!!file} onOpenChange={o=>{if(!o)setSelection(null);}}/>,button:(f:ParentFileMeta,label='Xem')=><Button size="sm" icon={<Eye className="size-4"/>} onClick={()=>open(f)} aria-label={`${label}: ${f.name}`}>{label}</Button>};
}
export function useSafeDownload(){
 const p=useParent(),toast=useToast();
 return async(fileId:string)=>{try{const result=await parentRepo.downloadFile(p.key,p.slug,fileId);result.assertCurrent();downloadBlob(result.blob,result.filename);}
 catch(error){toast.push({tone:'error',title:'Không tải được tệp',detail:(error as Error).message});}};
}
