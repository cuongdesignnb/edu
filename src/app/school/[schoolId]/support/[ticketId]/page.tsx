"use client";
import { use } from "react";
import { supportRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { QueryState } from "@/components/ui/states";
import { SupportTicketView } from "@/features/school-ops/support";

/** SC43 — Chi tiết hỗ trợ của trường. */
export default function Page({ params }: { params: Promise<{ schoolId: string; ticketId: string }> }) {
  const { schoolId, ticketId } = use(params);
  const q = useRepo(["school-ticket", schoolId, ticketId], (c) => supportRepo.ticket(c, schoolId, ticketId));
  return <QueryState query={q} skeleton="detail">{(d) => <SupportTicketView schoolId={schoolId} data={d} />}</QueryState>;
}
