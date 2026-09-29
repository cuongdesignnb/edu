"use client";
import { LegalDoc } from "@/features/system/legal-doc";
import { TERMS_SECTIONS } from "@/features/system/legal-content";

/** SY04 — terms of use (draft, no payment terms). */
export default function Page() {
  return <LegalDoc title="Điều kiện sử dụng" subtitle="Nguyên tắc sử dụng EduManage cho nhà trường, nhân sự và phụ huynh" sections={TERMS_SECTIONS} other={{ href: "/privacy", label: "Thông tin quyền riêng tư" }} />;
}
