import { NotificationDetail } from "@/features/auth/notification-detail";

export default async function Page({ params }: { params: Promise<{ notificationId: string }> }) {
  const { notificationId } = await params;
  return <NotificationDetail notificationId={notificationId} />;
}
