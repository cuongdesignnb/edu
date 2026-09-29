"use client";
import { useState } from "react";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, CalendarDays, Info } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { parentExtraRepo } from "@/lib/repositories/parent-extra";
import { addDays, demoToday, mondayOf } from "@/lib/demo/clock";
import { useParentView } from "@/features/parent/shell";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { fmtDate, fmtDateLong } from "@/lib/formatters";
import { PState, usePRead, ParentHeader, ParentPage } from "./common";

/** PA06 — week timetable within the granted year; changed / cancelled lessons with reason. */
export function ParentTimetableView() {
  useParentView("timetable");
  const today = demoToday();
  const [week, setWeek] = useState(() => mondayOf(today));
  const yq = usePRead(["granted-year"], (k, s) => parentExtraRepo.grantedYear(k, s));
  const q = usePRead(["timetable", week], (k, s) => parentRepo.timetable(k, s, week));
  const minWeek = yq.data ? mondayOf(yq.data.startDate) : undefined;
  const maxWeek = yq.data ? mondayOf(yq.data.endDate) : undefined;

  const nav = (
    <div className="flex items-center gap-1">
      <IconButton label="Tuần trước" variant="secondary" icon={<ChevronLeft className="size-5" />} disabled={!minWeek || week <= minWeek} onClick={() => setWeek(addDays(week, -7))} />
      <Button size="sm" disabled={week === mondayOf(today)} onClick={() => setWeek(mondayOf(today))}>Tuần này</Button>
      <IconButton label="Tuần sau" variant="secondary" icon={<ChevronRight className="size-5" />} disabled={!maxWeek || week >= maxWeek} onClick={() => setWeek(addDays(week, 7))} />
    </div>
  );

  return (
    <ParentPage>
      <ParentHeader title="Lịch học của con" subtitle={`Thời khóa biểu theo tuần${yq.data ? ` · Năm học ${yq.data.label}` : ""}`} />
      <PState query={q}>
        {(d) => {
          const changes = d.days.flatMap((day) => day.lessons.filter((l) => l.cancelled || l.changed).map((l) => ({ date: day.date, ...l })));
          return (
            <>
              <Card>
                <CardHeader icon={<CalendarDays className="size-5" />} title={`Tuần ${d.week ?? ""} · ${fmtDate(d.weekStart)} – ${fmtDate(addDays(d.weekStart, 5))}`} action={nav} />
                <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                  {d.days.map((day) => (
                    <section key={day.date} aria-label={fmtDateLong(day.date)} className={clsx("rounded-xl border p-3", day.date === today ? "border-primary bg-primary-light/50" : "border-line bg-white")}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h2 className="text-[14.5px] font-bold text-ink">{fmtDateLong(day.date)}</h2>
                        {day.date === today && <Badge tone="info">Hôm nay</Badge>}
                      </div>
                      {day.holiday ? <p className="rounded-lg bg-purple-bg px-3 py-2 text-[13px] font-medium text-purple-text">Nghỉ: {day.holiday}</p>
                        : day.lessons.length === 0 ? <p className="text-[13px] text-muted">Không có tiết học.</p> : (
                          <ul className="space-y-1.5">
                            {day.lessons.map((l) => (
                              <li key={l.period} className={clsx("flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13px]", l.cancelled ? "bg-danger-bg/60" : l.changed ? "bg-warning-bg/70" : "bg-[#f7fbff]")}>
                                <span className="w-12 flex-none font-semibold text-ink">Tiết {l.period}</span>
                                <span className="min-w-0 flex-1">
                                  <span className={clsx("block font-semibold text-ink", l.cancelled && "line-through")}>{l.subject}</span>
                                  <span className="block text-[12px] text-muted">{l.start} – {l.end} · {l.room} · {l.teacher}</span>
                                  {l.cancelled && <span className="block text-[12px] font-semibold text-danger-text">Tiết nghỉ{l.changed ? `: ${l.changed}` : ""}</span>}
                                  {!l.cancelled && l.changed && <span className="block text-[12px] font-semibold text-warning-text">Thay đổi: {l.changed}</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                    </section>
                  ))}
                </div>
              </Card>
              {changes.length > 0 ? (
                <Callout tone="warning" icon={<Info />} title={`Thay đổi trong tuần (${changes.length})`}>
                  <ul className="list-disc space-y-0.5 pl-4">{changes.map((c) => <li key={c.date + c.period}>{fmtDateLong(c.date)}, tiết {c.period} – {c.subject}: {c.cancelled ? "nghỉ" : "thay đổi"}{c.changed ? ` (${c.changed})` : ""}</li>)}</ul>
                </Callout>
              ) : <Callout tone="info" icon={<Info />}>Tuần này không có thay đổi lịch đã công bố. Liên hệ công việc về môn học qua mục Giáo viên liên hệ (nếu được chia sẻ).</Callout>}
            </>
          );
        }}
      </PState>
    </ParentPage>
  );
}
