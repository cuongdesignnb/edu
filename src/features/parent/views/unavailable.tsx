"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Link2Off, Ban, School, Lock, Phone, Mail, MapPin, Info } from "lucide-react";
import { announcementsRepo } from "@/lib/repositories";
import { writeParentToken } from "@/lib/demo/session";
import { Brand } from "@/components/layout/brand";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/states";

const REASONS: Record<string, { title: string; text: string; icon: React.ReactNode }> = {
  expired: { title: "Đường dẫn đã hết hạn", text: "Link riêng này đã quá thời hạn sử dụng nhà trường đặt khi cấp. Thông tin của học sinh không còn hiển thị qua link này.", icon: <Clock3 className="size-7" /> },
  revoked: { title: "Đường dẫn đã bị thu hồi", text: "Nhà trường đã thu hồi link này (ví dụ khi cấp link mới hoặc khi link bị chuyển tiếp nhầm). Link cũ không còn mở được thông tin.", icon: <Ban className="size-7" /> },
  invalid: { title: "Đường dẫn không hợp lệ", text: "Không nhận ra đường dẫn này. Có thể link bị gõ sai, bị cắt mất một phần, hoặc không thuộc trường này.", icon: <Link2Off className="size-7" /> },
  suspended: { title: "Nhà trường đang tạm dừng sử dụng hệ thống", text: "Trường hiện tạm dừng trên EduManage nên trang thông tin cho gia đình tạm thời không mở được. Dữ liệu không bị xóa.", icon: <School className="size-7" /> },
  module: { title: "Mục này chưa được chia sẻ qua link của bạn", text: "Link riêng chỉ mở những mục nhà trường cho phép. Mục bạn vừa mở không nằm trong phạm vi được cấp.", icon: <Lock className="size-7" /> },
};

/** PA14 — link unavailable (ST22). Never shows any student data; only the school's public contact. */
export function ParentUnavailableView({ slug }: { slug: string }) {
  const sp = useSearchParams();
  const reason = REASONS[sp.get("reason") ?? ""] ? (sp.get("reason") as string) : "invalid";
  const r = REASONS[reason];
  // The tab no longer holds a usable link (except "module", where the link itself is still valid).
  useEffect(() => { if (reason !== "module") writeParentToken(slug, null); }, [reason, slug]);
  const pub = useQuery({ queryKey: ["public-school-contact", slug], queryFn: () => announcementsRepo.publicSchool(slug).catch(() => null), retry: false });
  const s = pub.data?.school;

  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <header className="border-b border-line bg-gradient-to-r from-white via-[#f5f9ff] to-[#eaf3ff]">
        <div className="mx-auto flex h-[72px] max-w-[1100px] items-center px-4"><Brand /></div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="card w-full max-w-xl overflow-hidden">
          <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center sm:px-8">
            <span className={`icon-tile !size-14 !rounded-full ${reason === "invalid" || reason === "revoked" ? "tone-pink" : reason === "module" ? "tone-blue" : "tone-amber"}`} aria-hidden>{r.icon}</span>
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-muted">Link không sử dụng được</p>
            <h1 className="mt-1 text-[22px] font-bold text-ink sm:text-[24px]">{r.title}</h1>
            <p className="mt-2 max-w-md text-[14.5px] text-body">{r.text}</p>
            <div className="mt-5 flex w-full items-start gap-3 rounded-xl border border-[#cfe3fb] bg-primary-light px-4 py-3 text-left text-[13.5px] text-[#0b4c99]">
              <Info className="mt-0.5 size-[18px] flex-none" aria-hidden />
              <p>{reason === "module" ? "Vui lòng liên hệ giáo viên chủ nhiệm nếu gia đình cần xem thêm mục này." : reason === "suspended" ? "Vui lòng liên hệ văn phòng nhà trường để biết thời gian sử dụng lại." : "Vui lòng liên hệ giáo viên chủ nhiệm để được cấp lại link."} Không có đăng ký hay đăng nhập cho phụ huynh — link mới do nhà trường gửi trực tiếp cho gia đình.</p>
            </div>
          </div>
          <div className="border-t border-line bg-[#f7fbff] px-6 py-5 sm:px-8">
            <p className="text-[13px] font-semibold text-ink">Liên hệ công khai của nhà trường</p>
            {pub.isLoading ? <Skeleton className="mt-2 h-16" /> : s ? (
              <ul className="mt-2 space-y-1.5 text-[13.5px] text-body">
                <li className="font-semibold text-ink">{s.name}</li>
                {s.address && <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 flex-none text-primary" aria-hidden />{s.address}</li>}
                {s.publicPhone && <li className="flex items-center gap-2"><Phone className="size-4 flex-none text-primary" aria-hidden /><a className="hover:underline" href={`tel:${s.publicPhone.replace(/\s/g, "")}`}>{s.publicPhone}</a></li>}
                {s.publicEmail && <li className="flex items-center gap-2"><Mail className="size-4 flex-none text-primary" aria-hidden /><a className="hover:underline" href={`mailto:${s.publicEmail}`}>{s.publicEmail}</a></li>}
              </ul>
            ) : <p className="mt-2 text-[13.5px] text-muted">Không xác định được trường từ đường dẫn này. Vui lòng liên hệ trực tiếp giáo viên chủ nhiệm của con.</p>}
            {s && <div className="mt-4"><ButtonLink href={`/schools/${s.slug}`} size="sm">Xem trang công khai của trường</ButtonLink></div>}
          </div>
        </div>
      </main>
    </div>
  );
}
