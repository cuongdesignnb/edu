import { AccountShell } from "@/components/layout/shells";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
