"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { UploadCloud, FileText, FileWarning, Download, AlertCircle, Ban } from "lucide-react";
import type { FileAsset } from "@/lib/model/types";
import { getBlob,RepoError,errorMessage } from "@/lib/repositories";
import { download } from "@/lib/api/client";
import { downloadBlob } from "@/lib/export";
import { fmtBytes } from "@/lib/formatters";
import { Button } from "./button";

/** C020 — local-only dropzone with type/size checks; clearly states nothing goes to a server. */
export function FileDropzone({ accept, maxBytes, multiple, onFiles, label = "Kéo thả tệp vào đây hoặc chọn tệp", hint, error, disabled }: {
  accept: string[]; maxBytes: number; multiple?: boolean; onFiles: (files: File[]) => void; label?: string; hint?: ReactNode; error?: string; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [local, setLocal] = useState<string>();
  const handle = (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    const bad = files.find((f) => !accept.some((a) => (a.startsWith(".") ? f.name.toLowerCase().endsWith(a) : f.type === a)));
    if (bad) { setLocal(`"${bad.name}" có định dạng không hỗ trợ.`); return; }
    const big = files.find((f) => f.size > maxBytes);
    if (big) { setLocal(`"${big.name}" vượt giới hạn ${fmtBytes(maxBytes)}.`); return; }
    setLocal(undefined);
    onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <div>
      <div role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
        onClick={() => !disabled && input.current?.click()} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) handle(e.dataTransfer.files); }}
        className={clsx("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors", over ? "border-primary bg-primary-light" : "border-line-strong bg-[#f9fbfe] hover:bg-primary-light/60", (error || local) && "border-danger", disabled && "cursor-not-allowed opacity-50")}>
        <UploadCloud className="size-7 text-primary" aria-hidden />
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-[12.5px] text-muted">{hint ?? `Tối đa ${fmtBytes(maxBytes)}.`} Chọn tệp chưa tự động gửi biểu mẫu.</p>
        <input ref={input} type="file" hidden multiple={multiple} accept={accept.join(",")} onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
      </div>
      {(error || local) && <p className="error-text mt-1.5" role="alert"><AlertCircle className="size-3.5" aria-hidden />{error ?? local}</p>}
    </div>
  );
}

export type StaffFileSource={kind:'staff_api';schoolId:string;fileId:string;owner:{assertCurrent:()=>void}};
type PreviewSource = Pick<FileAsset, "name" | "mime" | "size"> & {source?:FileAsset['source']|StaffFileSource};
async function actualBlob(file:PreviewSource){
  if(file.source?.kind==='staff_api'){const s=file.source;s.owner.assertCurrent();const value=await download('downloadFile',{params:{schoolId:s.schoolId,fileId:s.fileId}});s.owner.assertCurrent();if(value.blob.type!==file.mime||value.blob.size!==file.size)throw new RepoError('READ_ERROR','Nội dung tệp không khớp thông tin đã tải.');return value.blob;}
  if(file.source?.kind==='blob')return getBlob(file.source.blobKey);
  throw new RepoError('READ_ERROR','Tệp chưa có nội dung được xác nhận từ API.');
}

/** Resolve an object URL for a stored blob; revoked on unmount (no leaks). */
export function useFileUrl(file?: PreviewSource | null) {
  const [resolved, setResolved] = useState<{file:PreviewSource;url:string}|null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    setResolved(null);
    setMissing(false);
    if (!file) return;
    if (!file.source || file.source.kind === "synthetic") {
      setMissing(true);
      return;
    }
    actualBlob(file).then((b) => {
      if (!alive) return;
      if (!b) { setMissing(true); return; }
      revoke = URL.createObjectURL(b);
      setResolved({file,url:revoke});
    }).catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, [file]);
  return { url:resolved&&resolved.file===file?resolved.url:null, missing };
}

export async function downloadFileAsset(file: PreviewSource) {
  if (file.source?.kind === "blob"||file.source?.kind==='staff_api') {
    const b = await actualBlob(file);
    if (b) downloadBlob(b, file.name);
    return !!b;
  }
  throw new RepoError('READ_ERROR','Tệp chưa có nội dung được xác nhận từ API.');
}

/** C035 — image / PDF (browser viewer) / synthetic document / unsupported / revoked fallback. */
export function FilePreview({ file, revoked, className,allowLocalDownload=true }: { file?: PreviewSource | null; revoked?: boolean; className?: string;allowLocalDownload?:boolean }) {
  const { url, missing } = useFileUrl(revoked ? null : file);
  const [downloadError,setDownloadError]=useState<string|null>(null);
  if (revoked) return <div className={clsx("flex flex-col items-center justify-center gap-2 rounded-xl bg-danger-bg p-8 text-center text-danger-text", className)}><Ban className="size-7" aria-hidden /><p className="font-semibold">Tệp đã bị thu hồi</p><p className="text-sm">Không thể xem hoặc tải lần mới.</p></div>;
  if (!file) return null;
  if (missing) return <div className={clsx("flex flex-col items-center justify-center gap-2 rounded-xl bg-warning-bg p-8 text-center text-warning-text", className)}><FileWarning className="size-7" aria-hidden /><p className="font-semibold">Chưa tải được nội dung tệp</p><p className="text-sm">Tệp chưa được nối với API hoặc không còn trong phạm vi được xem.</p></div>;
  if (file.mime.startsWith("image/") && url) return <img src={url} alt={`Xem trước: ${file.name}`} className={clsx("max-h-[60vh] w-full rounded-xl border border-line bg-[#f7fbff] object-contain", className)} />;
  if (file.mime === "application/pdf" && file.source?.kind === "blob" && url) return <iframe title={`Xem trước ${file.name}`} src={url} className={clsx("h-[60vh] w-full rounded-xl border border-line", className)} />;
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 rounded-xl bg-[#f7fbff] p-8 text-center", className)}>
      <FileText className="size-8 text-primary" aria-hidden />
      <p className="font-semibold text-ink">Không xem trước được định dạng này</p>
      <p className="text-sm text-muted">{file.name} · {fmtBytes(file.size)}</p>
      {downloadError&&<p role="alert" className="text-sm text-danger-text">{downloadError}</p>}
      {allowLocalDownload&&<Button size="sm" icon={<Download className="size-4" />} onClick={async() => {setDownloadError(null);try{await downloadFileAsset(file);}catch(error){setDownloadError(errorMessage(error));}}}>Tải xuống</Button>}
    </div>
  );
}

export function FileThumb({ file, className }: { file: PreviewSource; className?: string }) {
  const { url } = useFileUrl(file);
  if (file.mime.startsWith("image/") && url) return <img src={url} alt="" className={clsx("aspect-[4/3] w-full rounded-lg object-cover", className)} />;
  return <div className={clsx("flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-primary-light text-primary", className)}><FileText className="size-7" aria-hidden /></div>;
}
