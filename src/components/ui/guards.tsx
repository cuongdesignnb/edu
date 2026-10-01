"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, RefreshCw, FlaskConical } from "lucide-react";
import { Modal } from "./dialog";
import { Button } from "./button";
import type { RepoError } from "@/lib/repositories";
import { fmtDateTime } from "@/lib/formatters";
import { IS_DEMO } from "@/lib/data-mode";

/* ------------------------------ C045 / O32 unsaved changes ------------------------------ */
interface GuardApi { register: (id: string, dirty: boolean, save?: () => Promise<boolean>) => void; confirm: (proceed: () => void) => void }
const GuardCtx = createContext<GuardApi>({ register: () => undefined, confirm: (p) => p() });

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirtyMap = useRef(new Map<string, { dirty: boolean; save?: () => Promise<boolean> }>());
  const [pending, setPending] = useState<null | { proceed: () => void; save?: () => Promise<boolean> }>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const isDirty = () => [...dirtyMap.current.values()].some((v) => v.dirty);
  const register = useCallback((id: string, dirty: boolean, save?: () => Promise<boolean>) => {
    if (!dirty) dirtyMap.current.delete(id); else dirtyMap.current.set(id, { dirty, save });
  }, []);
  const firstSaver = () => [...dirtyMap.current.values()].find((v) => v.dirty && v.save)?.save;
  const confirm = useCallback((proceed: () => void) => { if (isDirty()) setPending({ proceed, save: firstSaver() }); else proceed(); }, []);

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } };
    const onClick = (e: MouseEvent) => {
      if (!isDirty() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.noGuard !== undefined) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ proceed: () => router.push(url.pathname + url.search + url.hash), save: firstSaver() });
    };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", onBefore); document.removeEventListener("click", onClick, true); };
  }, [router]);

  return (
    <GuardCtx.Provider value={{ register, confirm }}>
      {children}
      <Modal open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }} title="Bạn có thay đổi chưa lưu" size="sm" busy={saving}
        description="Rời trang bây giờ sẽ mất nội dung chưa lưu."
        footer={<>
          <Button variant="ghost" onClick={() => setPending(null)} disabled={saving}>Ở lại</Button>
          <Button variant="danger-soft" disabled={saving} onClick={() => { const p = pending; dirtyMap.current.clear(); setPending(null); p?.proceed(); }}>Bỏ thay đổi</Button>
          {pending?.save && <Button variant="primary" loading={saving} onClick={async () => { const p = pending; setSaving(true); const ok = await p.save!(); setSaving(false); if (ok) { dirtyMap.current.clear(); setPending(null); p.proceed(); } }}>Lưu rồi tiếp tục</Button>}
        </>}>
        <p className="flex gap-2.5 text-sm text-body"><AlertTriangle className="mt-0.5 size-4 flex-none text-warning" aria-hidden />Dữ liệu chưa lưu chỉ còn trong biểu mẫu đang mở. Chọn “Ở lại” để tiếp tục chỉnh sửa.</p>
      </Modal>
    </GuardCtx.Provider>
  );
}

/** Register a form as dirty; optionally give a save function for "Lưu rồi tiếp tục". */
export function useUnsavedChanges(dirty: boolean, save?: () => Promise<boolean>) {
  const { register } = useContext(GuardCtx);
  const id = useId();
  useEffect(() => { register(id, dirty, save); return () => register(id, false); }, [dirty, save, id, register]);
}

export function useLeaveGuard() {
  return useContext(GuardCtx).confirm;
}

/* ------------------------------ C046 / O33 version conflict ------------------------------ */
export function ConflictDialog({ error, onReload, onClose, mine }: { error: RepoError | null; onReload: () => void; onClose: () => void; mine?: ReactNode }) {
  const d = error?.details as { updatedBy?: string; updatedAt?: string; simulated?: boolean } | undefined;
  return (
    <Modal open={!!error && error.code === "CONFLICT"} onOpenChange={(o) => { if (!o) onClose(); }} title="Dữ liệu đã thay đổi" size="md"
      description="Để không ghi đè âm thầm, thao tác lưu đã dừng lại."
      footer={<><Button variant="ghost" onClick={onClose}>Ở lại xem nội dung của tôi</Button><Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={onReload}>Tải bản mới nhất</Button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-body">{error?.message}</p>
        {d?.updatedBy && <p className="rounded-lg bg-warning-bg px-3 py-2 text-warning-text">Người thay đổi: <b>{d.updatedBy}</b>{d.updatedAt ? ` — lúc ${fmtDateTime(d.updatedAt)}` : ""}</p>}
        {d?.simulated && <p className="rounded-lg bg-neutral-bg px-3 py-2 text-neutral-text">Xung đột này do kịch bản demo “Xung đột phiên bản” tạo ra.</p>}
        {mine && <div><p className="mb-1 font-semibold text-ink">Nội dung bạn đang nhập (chưa lưu):</p><div className="rounded-lg border border-line bg-[#f7fbff] p-3">{mine}</div></div>}
        <p className="text-muted">Tải bản mới sẽ hiển thị dữ liệu hiện tại; bạn có thể nhập lại thay đổi nếu vẫn cần.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------ C047 demo scenario banner ------------------------------ */
export function DemoScenarioBanner(_props:{compact?:boolean}){return null;}
