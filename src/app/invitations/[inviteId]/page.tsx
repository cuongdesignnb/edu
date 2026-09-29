"use client";
import { use } from "react";
import { AuthFrame } from "@/features/auth/auth-frame";
import { InvitationView } from "@/features/auth/invitation-view";

/** AU04 — staff invitation. */
export default function InvitationPage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = use(params);
  return (
    <AuthFrame title="Lời mời tham gia nhà trường" subtitle="Kiểm tra trường, nhiệm vụ và người mời trước khi chấp nhận.">
      <InvitationView inviteId={inviteId} />
    </AuthFrame>
  );
}
