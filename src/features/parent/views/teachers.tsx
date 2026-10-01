"use client";
import { Users, Phone, Mail, Clock3, MapPin, School, BookOpen, Info } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { Card, CardHeader, CardLink, Callout } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/states";
import { PState, usePRead, useHref, ParentHeader, ParentPage } from "./common";
import { useParent } from "@/features/parent/shell";

function Contact({ phone, email }: { phone?: string; email?: string }) {
  if (!phone && !email) return <span className="text-muted">Qua văn phòng trường</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {phone && <a href={`tel:${phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="size-3.5 text-primary" aria-hidden />{phone}</a>}
      {email && <a href={`mailto:${email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:underline"><Mail className="size-3.5 flex-none text-primary" aria-hidden /><span className="truncate">{email}</span></a>}
    </span>
  );
}

/** PA12 — homeroom + subject teachers of the class; contact only as the school allows; no chat. */
export function ParentTeachersView() {
  const href = useHref();
  const p = useParent();
  const q = usePRead(["teachers"], (k, s) => parentRepo.teachers(k, s));
  return (
    <ParentPage>
      <ParentHeader title="Giáo viên phụ trách" subtitle={`Giáo viên chủ nhiệm và giáo viên bộ môn lớp ${p.context.className}`} />
      <PState query={q}>
        {(d) => (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <CardHeader className="rounded-t-[14px] border-b border-line bg-gradient-to-r from-[#eaf3ff] to-white !py-3" icon={<Users className="size-5" />} title="Giáo viên chủ nhiệm" />
                {d.homeroom ? (
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                    <Avatar name={d.homeroom.name} tone={d.homeroom.tone} square size={96} className="!rounded-2xl" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-[18px] font-bold text-ink">{d.homeroom.name}</p>
                      <p className="text-muted">Giáo viên chủ nhiệm lớp {d.homeroom.className}</p>
                      <div className="mt-3 space-y-1.5 text-body">
                        {d.homeroom.phone && <p className="flex items-center gap-2"><Phone className="size-4 text-primary" aria-hidden /><a href={`tel:${d.homeroom.phone.replace(/\s/g, "")}`} className="hover:underline">{d.homeroom.phone}</a></p>}
                        {d.homeroom.email && <p className="flex min-w-0 items-center gap-2"><Mail className="size-4 flex-none text-primary" aria-hidden /><a href={`mailto:${d.homeroom.email}`} className="truncate hover:underline">{d.homeroom.email}</a></p>}
                        {!d.homeroom.phone && !d.homeroom.email && <p className="text-muted">Nhà trường chưa chia sẻ số điện thoại/email của giáo viên. Vui lòng liên hệ văn phòng trường.</p>}
                        {d.contactHours && <p className="flex items-center gap-2"><Clock3 className="size-4 text-primary" aria-hidden />Thời gian liên hệ: {d.contactHours}</p>}
                      </div>
                    </div>
                  </div>
                ) : <EmptyState compact title="Lớp chưa có giáo viên chủ nhiệm được phân công" />}
              </Card>
              <Card>
                <CardHeader className="rounded-t-[14px] border-b border-line bg-gradient-to-r from-[#e6f7f0] to-white !py-3" icon={<BookOpen className="size-5 !text-success" />} title="Giáo viên bộ môn"
                  action={p.modules.includes("timetable") ? <CardLink href={href("timetable")}>Xem thời khóa biểu của lớp</CardLink> : undefined} />
                {d.subjects.length ? (
                  <>
                    <div className="table-wrap hidden sm:block">
                      <table className="table text-[13.5px]">
                        <thead><tr><th>Môn học</th><th>Giáo viên</th><th>Liên hệ</th><th>Thời gian dạy</th></tr></thead>
                        <tbody>
                          {d.subjects.map((s) => (
                            <tr key={s.subject + s.name}>
                              <td><span className="inline-flex items-center gap-2 font-medium text-ink"><span className="size-2.5 rounded-sm" style={{ background: s.subjectColor ?? "var(--color-primary)" }} aria-hidden />{s.subject}</span></td>
                              <td className="whitespace-nowrap">{s.name}</td>
                              <td><Contact phone={s.phone} email={s.email} /></td>
                              <td className="whitespace-nowrap">{s.days || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="divide-y divide-line sm:hidden">
                      {d.subjects.map((s) => (
                        <li key={s.subject + s.name} className="px-4 py-3 text-[13.5px]">
                          <p className="flex items-center gap-2 font-semibold text-ink"><span className="size-2.5 rounded-sm" style={{ background: s.subjectColor ?? "var(--color-primary)" }} aria-hidden />{s.subject}</p>
                          <p className="text-body">{s.name} · <span className="text-muted">{s.days || "—"}</span></p>
                          <div className="mt-1 text-body"><Contact phone={s.phone} email={s.email} /></div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : <EmptyState compact title="Chưa có phân công giáo viên bộ môn" />}
              </Card>
            </div>
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="rounded-t-[14px] border-b border-line bg-gradient-to-r from-[#e6f7f0] to-white !py-3" icon={<School className="size-5 !text-success" />} title="Thông tin nhà trường" />
                <div className="space-y-2 p-5 text-[13.5px] text-body">
                  <p className="font-bold text-ink">{d.school.name}</p>
                  {d.school.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 flex-none text-primary" aria-hidden />{d.school.address}</p>}
                  {d.school.publicPhone && <p className="flex items-center gap-2"><Phone className="size-4 text-primary" aria-hidden /><a href={`tel:${d.school.publicPhone.replace(/\s/g, "")}`} className="hover:underline">{d.school.publicPhone}</a></p>}
                  {d.school.publicEmail && <p className="flex min-w-0 items-center gap-2"><Mail className="size-4 flex-none text-primary" aria-hidden /><a href={`mailto:${d.school.publicEmail}`} className="truncate hover:underline">{d.school.publicEmail}</a></p>}
                </div>
              </Card>
              <Callout tone="info" icon={<Info />} title="Liên hệ công việc">Vui lòng liên hệ trong giờ hành chính của nhà trường. Trang không có nhắn tin trực tiếp; thông tin liên hệ hiển thị theo mức nhà trường cho phép.</Callout>
            </div>
          </div>
        )}
      </PState>
    </ParentPage>
  );
}
