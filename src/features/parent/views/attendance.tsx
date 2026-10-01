"use client";
import { useState } from "react";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Info, CalendarCheck } from "lucide-react";
import { useParent } from "@/features/parent/shell";
import { parentRepo } from "@/lib/repositories";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { IconButton } from "@/components/ui/button";
import { fmtDateLong } from "@/lib/formatters";
import { PState, usePRead, ParentHeader, ParentPage } from "./common";

const DAY_STATUS: Record<string, { label: string; short: string; cls: string; dot: string }> = {
  present: { label: "Có mặt", short: "Có mặt", cls: "bg-success-bg text-success-text border-[#bfe8d6]", dot: "bg-success" },
  late: { label: "Đi muộn", short: "Muộn", cls: "bg-warning-bg text-warning-text border-[#f5d9a6]", dot: "bg-warning" },
  excused: { label: "Nghỉ có phép", short: "Có phép", cls: "bg-primary-light text-primary-strong border-[#cfe3fb]", dot: "bg-primary" },
  unexcused: { label: "Nghỉ không phép", short: "K.phép", cls: "bg-danger-bg text-danger-text border-[#f6c9cb]", dot: "bg-danger" },
  unmarked: { label: "Chưa đánh dấu", short: "Chưa ĐD", cls: "bg-white text-muted border-dashed border-line-strong", dot: "bg-faint" },
  mixed: { label: "Khác nhau theo buổi", short: "Theo buổi", cls: "bg-primary-light text-primary-strong border-[#cfe3fb]", dot: "bg-primary" },
  not_published: { label: "Chưa công bố", short: "Chưa CB", cls: "bg-white text-muted border-dashed border-line-strong", dot: "bg-faint" },
  holiday: { label: "Ngày nghỉ", short: "Nghỉ lễ", cls: "bg-purple-bg text-purple-text border-[#ddd2ff]", dot: "bg-purple" },
  weekend: { label: "Chủ nhật", short: "CN", cls: "bg-neutral-bg text-neutral-text border-line", dot: "bg-neutral-text" },
  future: { label: "Chưa đến", short: "", cls: "bg-white text-muted border-line", dot: "bg-line-strong" },
};

const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function shiftMonth(m: string, n: number) {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** PA03 — Chuyên cần của con: only published sessions; missing data is never shown as present. */
export function ParentAttendanceView() {
  const {context}=useParent();
  const [month, setMonth] = useState(() => context.today.slice(0,7)<context.year.startsOn.slice(0,7)?context.year.startsOn.slice(0,7):context.today.slice(0,7));
  const q = usePRead(["attendance", month], (k, s) => parentRepo.attendance(k, s, month));
  const [y, m] = month.split("-").map(Number);

  return (
    <ParentPage>
      <ParentHeader title="Chuyên cần của con" subtitle="Chỉ hiển thị các buổi điểm danh giáo viên đã công bố" />
      <PState query={q}>
        {(d) => {
          const lead = (d.days[0]?.weekday ?? 1) - 1;
          const attended = d.totals.present + d.totals.late;
          return (
            <>
              <Card>
                <CardHeader icon={<CalendarCheck className="size-5" />} title={`Tháng ${String(m).padStart(2, "0")}/${y}`}
                  action={<div className="flex items-center gap-1">
                    <IconButton label="Tháng trước" icon={<ChevronLeft className="size-5" />} variant="secondary" disabled={month <= d.yearStart} onClick={() => setMonth(shiftMonth(month, -1))} />
                    <IconButton label="Tháng sau" icon={<ChevronRight className="size-5" />} variant="secondary" disabled={month >= d.yearEnd} onClick={() => setMonth(shiftMonth(month, 1))} />
                  </div>} />
                <div className="px-3 pb-4 sm:px-5">
                  <div className="grid grid-cols-7 gap-1 sm:gap-2" role="group" aria-label={`Lịch chuyên cần tháng ${m}/${y}`}>
                    {WD.map((w) => <div key={w} aria-hidden className="pb-1 text-center text-[12px] font-semibold text-muted">{w}</div>)}
                    {Array.from({ length: lead }).map((_, i) => <div key={`e${i}`} aria-hidden />)}
                    {d.days.map((day) => {
                      const st = DAY_STATUS[day.status] ?? DAY_STATUS.not_published;
                      return (
                        <div key={day.date} title={`${fmtDateLong(day.date)}: ${st.label}${day.holidayNames.length?` · ${day.holidayNames.join(", ")}`:""}`}
                          className={clsx("flex min-h-[54px] flex-col rounded-lg border p-1 sm:min-h-[76px] sm:rounded-xl sm:p-2", st.cls)}>
                          <span className="sr-only">{fmtDateLong(day.date)}: {st.label}{day.holidayNames.length?` · ${day.holidayNames.join(", ")}`:""}</span>
                          <span className="text-[12px] font-bold sm:text-[14px]" aria-hidden>{Number(day.date.slice(8))}</span>
                          <span className="mt-auto text-[10px] font-semibold leading-tight sm:hidden" aria-hidden>{st.short}</span>
                          <span className="mt-auto hidden text-[12px] font-semibold leading-tight sm:block" aria-hidden>{day.status === "future" ? "" : st.label}</span>
                          {day.sessions.map((session,index)=><span key={`${session.slotLabel}:${index}`} className="mt-1 block text-[10px] leading-snug sm:text-[11px]">{session.slotLabel}: {DAY_STATUS[session.status.toLowerCase()]?.label}{session.publicNote?` · ${session.publicNote}`:''}</span>)}
                        </div>
                      );
                    })}
                  </div>
                  <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-body" aria-label="Chú thích">
                    {Object.entries(DAY_STATUS).map(([k, v]) => <li key={k} className="flex items-center gap-1.5"><span className={clsx("size-2.5 rounded-full", v.dot)} aria-hidden />{v.label}</li>)}
                  </ul>
                </div>
              </Card>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
                <Card className="card-pad">
                  <h2 className="card-title">Tổng hợp tháng {m}/{y}</h2>
                  {d.totals.published ? (
                    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {([["present", d.totals.present], ["late", d.totals.late], ["excused", d.totals.excused], ["unexcused", d.totals.unexcused]] as const).map(([k, v]) => (
                        <div key={k} className={clsx("rounded-xl border px-3 py-2.5", DAY_STATUS[k].cls)}><dt className="text-[12px] font-semibold">{DAY_STATUS[k].label}</dt><dd className="text-[22px] font-bold tabular-nums">{v}</dd></div>
                      ))}
                    </dl>
                  ) : <p className="mt-3 text-sm text-muted">Tháng này chưa có buổi điểm danh nào được công bố.</p>}
                  {d.totals.unmarked>0&&<p className="mt-3 text-[13px] text-muted">{d.totals.unmarked} buổi đã công bố nhưng chưa đánh dấu; không tính là có mặt, vắng hay đưa vào tỷ lệ.</p>}
                  <p className="mt-3 text-[13px] text-muted">{d.totals.published ? d.totals.marked?`Con có mặt ${attended}/${d.totals.marked} buổi đã được đánh dấu và công bố (tính cả đi muộn).`:"Chưa có buổi được đánh dấu để tính tỷ lệ." : "Không tính tỷ lệ khi chưa có dữ liệu công bố."}</p>
                </Card>
                <Callout tone="info" icon={<Info />} title="Cách đọc lịch chuyên cần">
                  <ul className="list-disc space-y-1 pl-4">
                    <li>Mỗi ô giữ các buổi và ghi chú đã công bố của ngày đó; tổng hợp đếm theo buổi.</li>
                    <li>“Chưa công bố” nghĩa là giáo viên chưa công bố điểm danh — không có nghĩa là con có mặt hay vắng.</li>
                    <li>Chỉ xem được các tháng trong năm học được cấp qua link.</li>
                  </ul>
                </Callout>
              </div>
            </>
          );
        }}
      </PState>
    </ParentPage>
  );
}
