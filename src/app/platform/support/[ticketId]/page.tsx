"use client";
import { use } from "react";
import { TicketDetail } from "@/features/platform/ticket-detail";

/** PL07 — support ticket detail. */
export default function Page({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = use(params);
  return <TicketDetail ticketId={ticketId} />;
}
