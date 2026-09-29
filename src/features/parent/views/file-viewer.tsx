"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText } from "lucide-react";
import { parentRepo, type RepoError } from "@/lib/repositories";
import { useParent } from "@/features/parent/shell";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FilePreview, downloadFileAsset } from "@/components/ui/file";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { fmtBytes } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { keyId } from "./common";

export interface ParentFileMeta { id: string; name: string; mime: string; size: number }

/**
 * O28 for parents — every open re-checks the file through parentRepo.file (only files shared
 * with THIS student/class; revoked files are refused). No upload, no submit.
 */
export function ParentFileViewer({ file, open, onOpenChange }: { file: ParentFileMeta | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const p = useParent();
  const toast = useToast();
  const q = useQuery<Awaited<ReturnType<typeof parentRepo.file>>, RepoError>({
    queryKey: ["parent-file", keyId(p.key), p.slug, file?.id], queryFn: () => parentRepo.file(p.key, p.slug, file!.id), enabled: open && !!file, retry: false, staleTime: 0,
  });
  const revoked = q.error?.code === "REVOKED" && q.error.message !== "revoked";
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={file?.name ?? "Xem tệp"} description={file ? `${fmtBytes(file.size)} · Chỉ xem, tải về khi nhà trường cho phép` : undefined}
      footer={q.data ? <>
        <Button onClick={() => onOpenChange(false)}>Đóng</Button>
        <Button variant="primary" icon={<Download className="size-4" />} onClick={async () => { const ok = await downloadFileAsset(q.data!); if (!ok) toast.push({ tone: "error", title: "Không tìm thấy nội dung tệp trên trình duyệt này" }); }}>Tải xuống</Button>
      </> : <Button onClick={() => onOpenChange(false)}>Đóng</Button>}>
      {q.isLoading && <Skeleton className="h-64 rounded-xl" />}
      {revoked && <FilePreview revoked />}
      {q.error && !revoked && <EmptyState compact icon={<FileText className="size-6" />} title="Không mở được tệp" description={q.error.message} />}
      {q.data && <FilePreview file={q.data} />}
    </Modal>
  );
}

/** Small helper: state + trigger for the viewer. */
export function useFileViewer() {
  const [file, setFile] = useState<ParentFileMeta | null>(null);
  return {
    open: (f: ParentFileMeta) => setFile(f),
    node: <ParentFileViewer file={file} open={!!file} onOpenChange={(o) => { if (!o) setFile(null); }} />,
    button: (f: ParentFileMeta, label = "Xem") => <Button size="sm" icon={<Eye className="size-4" />} onClick={() => setFile(f)} aria-label={`${label}: ${f.name}`}>{label}</Button>,
  };
}

/** Download after re-checking the file for this link (a revoked link/file cannot download again). */
export function useSafeDownload() {
  const p = useParent();
  const toast = useToast();
  return async (fileId: string) => {
    try {
      const f = await parentRepo.file(p.key, p.slug, fileId);
      const ok = await downloadFileAsset(f);
      if (!ok) toast.push({ tone: "error", title: "Không tìm thấy nội dung tệp trên trình duyệt này" });
    } catch (e) {
      toast.push({ tone: "error", title: "Không tải được tệp", detail: (e as Error).message });
    }
  };
}
