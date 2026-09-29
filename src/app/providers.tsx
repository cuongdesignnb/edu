"use client";
import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initStore, subscribe } from "@/lib/repositories";
import { ToastProvider } from "@/components/ui/toast";
import { UnsavedChangesProvider } from "@/components/ui/guards";
import { PageSkeleton } from "@/components/ui/states";

/**
 * Initialises the local demo store once, then invalidates queries whenever the store
 * changes — locally or from another tab of the same origin (BroadcastChannel).
 */
function StoreGate({ client, children }: { client: QueryClient; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = () => {};
    initStore().then(() => {
      setReady(true);
      off = subscribe((source) => { if (source === "remote") client.invalidateQueries(); });
    }).catch(() => setFailed(true));
    return () => off();
  }, [client]);
  if (failed) return <div role="alert" className="p-8 text-center text-danger-text">Trình duyệt chặn bộ nhớ cục bộ (IndexedDB) nên bản demo không khởi tạo được dữ liệu. Hãy tắt chế độ duyệt ẩn danh nghiêm ngặt hoặc cho phép lưu trữ trang.</div>;
  if (!ready) return <PageSkeleton />;
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <StoreGate client={client}>
          <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
        </StoreGate>
      </ToastProvider>
    </QueryClientProvider>
  );
}
