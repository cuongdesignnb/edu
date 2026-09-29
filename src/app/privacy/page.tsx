"use client";
import { LegalDoc } from "@/features/system/legal-doc";
import { PRIVACY_SECTIONS } from "@/features/system/legal-content";

/** SY03 — privacy information (draft). */
export default function Page() {
  return <LegalDoc title="Thông tin quyền riêng tư" subtitle="Cách EduManage dự kiến xử lý thông tin của nhà trường, nhân sự, học sinh và gia đình" sections={PRIVACY_SECTIONS} other={{ href: "/terms", label: "Điều kiện sử dụng" }} />;
}
