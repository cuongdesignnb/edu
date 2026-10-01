"use client";
import { Suspense, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NativeStaffProvider } from "@/lib/query/native-provider";
import { ToastProvider } from "@/components/ui/toast";
import { UnsavedChangesProvider } from "@/components/ui/guards";
import { PageSkeleton } from "@/components/ui/states";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, // an errored query is only refetched by an explicit "Thử lại" — prevents mount/refetch loops
    refetchOnMount: (q) => q.state.status !== "error" } } }));
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <NativeStaffProvider>
          <Suspense fallback={<PageSkeleton />}><UnsavedChangesProvider>{children}</UnsavedChangesProvider></Suspense>
        </NativeStaffProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
