"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { UploadCloud, FileText, FileWarning, Download, AlertCircle, Ban } from "lucide-react";
import type { FileAsset } from "@/lib/model/types";
import { getBlob } from "@/lib/repositories";
import { syntheticDoc, syntheticImageSVG, svgDataUri } from "@/lib/files/synthetic";
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
        <p className="text-[12.5px] text-muted">{hint ?? `Tối đa ${fmtBytes(maxBytes)}.`} Tệp chỉ lưu trên trình duyệt này (mô phỏng), không tải lên máy chủ.</p>
        <input ref={input} type="file" hidden multiple={multiple} accept={accept.join(",")} onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
      </div>
      {(error || local) && <p className="error-text mt-1.5" role="alert"><AlertCircle className="size-3.5" aria-hidden />{error ?? local}</p>}
    </div>
  );
}

type PreviewSource = Pick<FileAsset, "name" | "mime" | "size" | "source">;

/** Resolve an object URL for a stored blob; revoked on unmount (no leaks). */
export function useFileUrl(file?: PreviewSource | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    setMissing(false);
    if (!file) { setUrl(null); return; }
    if (file.source.kind === "synthetic") {
      setUrl(file.mime.startsWith("image/") ? svgDataUri(syntheticImageSVG(file.source.pattern, file.name.replace(/\.[a-z]+$/i, ""))) : null);
      return;
    }
    getBlob(file.source.blobKey).then((b) => {
      if (!alive) return;
      if (!b) { setMissing(true); return; }
      revoke = URL.createObjectURL(b);
      setUrl(revoke);
    });
    return () => { alive = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, [file]);
  return { url, missing };
}

export async function downloadFileAsset(file: PreviewSource) {
  if (file.source.kind === "blob") {
    const b = await getBlob(file.source.blobKey);
    if (b) downloadBlob(b, file.name);
    return !!b;
  }
  if (file.mime.startsWith("image/")) {
    downloadBlob(new Blob([syntheticImageSVG(file.source.pattern, file.name)], { type: "image/svg+xml" }), file.name.replace(/\.[a-z]+$/i, "") + ".svg");
    return true;
  }
  const d = syntheticDoc(file.source.pattern);
  downloadBlob(new Blob([`﻿${d.title}\r\n\r\n${d.lines.join("\r\n")}\r\n\r\n(Tài liệu minh họa của bản demo EduManage)`], { type: "text/plain;charset=utf-8" }), file.name.replace(/\.[a-z]+$/i, "") + ".txt");
  return true;
}

/** C035 — image / PDF (browser viewer) / synthetic document / unsupported / revoked fallback. */
export function FilePreview({ file, revoked, className }: { file?: PreviewSource | null; revoked?: boolean; className?: string }) {
  const { url, missing } = useFileUrl(revoked ? null : file);
  if (revoked) return <div className={clsx("flex flex-col items-center justify-center gap-2 rounded-xl bg-danger-bg p-8 text-center text-danger-text", className)}><Ban className="size-7" aria-hidden /><p className="font-semibold">Tệp đã bị thu hồi</p><p className="text-sm">Không thể xem hoặc tải lần mới.</p></div>;
  if (!file) return null;
  if (missing) return <div className={clsx("flex flex-col items-center justify-center gap-2 rounded-xl bg-warning-bg p-8 text-center text-warning-text", className)}><FileWarning className="size-7" aria-hidden /><p className="font-semibold">Không tìm thấy nội dung tệp trên trình duyệt này</p><p className="text-sm">Tệp tải lên chỉ lưu cục bộ theo từng trình duyệt (mô phỏng).</p></div>;
  if (file.mime.startsWith("image/") && url) return <img src={url} alt={`Xem trước: ${file.name}`} className={clsx("max-h-[60vh] w-full rounded-xl border border-line bg-[#f7fbff] object-contain", className)} />;
  if (file.mime === "application/pdf" && file.source.kind === "blob" && url) return <iframe title={`Xem trước ${file.name}`} src={url} className={clsx("h-[60vh] w-full rounded-xl border border-line", className)} />;
  if (file.source.kind === "synthetic" && !file.mime.startsWith("image/")) {
    const d = syntheticDoc(file.source.pattern);
    return (
      <article className={clsx("rounded-xl border border-line bg-white p-6 shadow-inner", className)}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Tài liệu minh họa</p>
        <h3 className="mt-1 text-lg font-bold text-ink">{d.title}</h3>
        <ul className="mt-3 space-y-1.5 text-sm text-body">{d.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      </article>
    );
  }
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 rounded-xl bg-[#f7fbff] p-8 text-center", className)}>
      <FileText className="size-8 text-primary" aria-hidden />
      <p className="font-semibold text-ink">Không xem trước được định dạng này</p>
      <p className="text-sm text-muted">{file.name} · {fmtBytes(file.size)}</p>
      <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadFileAsset(file)}>Tải xuống</Button>
    </div>
  );
}

export function FileThumb({ file, className }: { file: PreviewSource; className?: string }) {
  const { url } = useFileUrl(file);
  if (file.mime.startsWith("image/") && url) return <img src={url} alt="" className={clsx("aspect-[4/3] w-full rounded-lg object-cover", className)} />;
  return <div className={clsx("flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-primary-light text-primary", className)}><FileText className="size-7" aria-hidden /></div>;
}
