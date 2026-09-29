"use client";
import { use } from "react";
import { PageHeader } from "@/components/layout/page";
import { SchoolAnnouncementList } from "@/features/announcements/school-list";

/** SC33 — Thông báo nhà trường. */
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  return (
    <div className="page">
      <PageHeader title="Thông báo nhà trường" subtitle="Soạn, đặt lịch, công bố và thu hồi thông báo tới nhân sự và gia đình học sinh"
        quote={["Thông tin đúng người, đúng lúc", "là cầu nối nhà trường và gia đình"]} illustration="/assets/illustrations/students-duo.png" />
      <SchoolAnnouncementList schoolId={schoolId} />
    </div>
  );
}
