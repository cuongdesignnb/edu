"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, CalendarRange, Download, FileSpreadsheet, CalendarCheck } from "lucide-react";
import type { AttendanceStatus } from "@/lib/model/types";
import { attendanceRepo } from "@/lib/repositories";
import { useCtx, useRepo } from "@/lib/query/hooks";
import { addDays, mondayOf, weekdayOf } from "@/lib/calendar";
import { attendanceStatus, fmtDate, fmtDayMonth, matches, weekdayLabel } from "@/lib/formatters";
import { downloadCSV, downloadXLSX, slugFile } from "@/lib/export";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, PUBLICATION_STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineSelect } from "@/components/ui/form";
import { FilterBar } from "@/components/data/table";
import { EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { StatusLegend, STATUS_STYLE } from "./status";
import { RecordHistoryDrawer } from "./history-drawer";

type Weekly = Awaited<ReturnType<typeof attendanceRepo.weekly>>;
type Cell = Weekly["rows"][number]["cells"][number];
const SPECIAL: Record<string, { abbr: string; label: string }> = {
  holiday: { abbr: "L", label: "Ngày nghỉ theo lịch trường" },
  not_enrolled: { abbr: "NL", label: "Chưa/không thuộc lớp ngày này" },
  future: { abbr: "·", label: "Ngày chưa tới" },
};

function cellText(c: Cell) {
  if (c.status in SPECIAL) return SPECIAL[c.status].abbr;
  return STATUS_STYLE[c.status as AttendanceStatus].abbr;
}
function cellLabel(c: Cell) {
  if (c.status in SPECIAL) return SPECIAL[c.status].label;
  return attendanceStatus[c.status as AttendanceStatus].label + ("edited" in c && c.edited ? " (đã sửa)" : "");
}

/** CL05 — week matrix: students × Mon–Sat (morning sessions), legend, totals, export, per-cell history. */
export function AttendanceWeekly() {
  const { schoolId, yearId, classId, base, header } = useClassroom();
  const ctx = useCtx();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const w = sp.get("week");
  const monday = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : undefined;
  const q = useRepo(["att-weekly", classId, monday ?? "cur"], (c) => attendanceRepo.weekly(c, schoolId, yearId, classId, monday));
  const [text, setText] = useState("");
  const [only, setOnly] = useState("");
  const [cell, setCell] = useState<{ studentId: string; date: string } | null>(null);
  const setWeek = (m: string) => router.replace(`${pathname}?week=${m}`, { scroll: false });
  return (
    <div className="page">
      <ClassHeader title="Chuyên cần theo tuần" subtitle="Ma trận học sinh × ngày (buổi sáng). Ký hiệu luôn kèm chữ, không chỉ dựa vào màu." crumbs={[{ label: "Điểm danh", href: `${base}/attendance` }, { label: "Theo tuần" }]} />
      <QueryState query={q} skeleton="table">
        {(d) => {
          const rows = d.rows.filter((r) => matches(text, r.fullName, r.code) && (!only || (only === "issues" ? r.tally.late + r.tally.excused + r.tally.unexcused > 0 : r.tally.unmarked > 0)));
          const exportRows = () => rows.map((r) => ({ code: r.code, name: r.fullName, ...Object.fromEntries(d.days.map((x, i) => [x.date, cellLabel(r.cells[i])])), present: r.tally.present, late: r.tally.late, excused: r.tally.excused, unexcused: r.tally.unexcused, unmarked: r.tally.unmarked }));
          const cols = [{ key: "code", label: "Mã HS" }, { key: "name", label: "Họ và tên" }, ...d.days.map((x) => ({ key: x.date, label: `${weekdayLabel(weekdayOf(x.date), true)} ${fmtDayMonth(x.date)}` })), { key: "present", label: "Có mặt" }, { key: "late", label: "Đi muộn" }, { key: "excused", label: "Nghỉ có phép" }, { key: "unexcused", label: "Nghỉ không phép" }, { key: "unmarked", label: "Chưa điểm danh" }];
          const file = slugFile(`chuyen-can-${header.class.name}-tuan-${d.week?.index ?? d.monday}`);
          const title = `Chuyên cần lớp ${header.class.name} — tuần ${fmtDate(d.monday)} – ${fmtDate(addDays(d.monday, 5))}`;
          return (
            <Card>
              <CardHeader title={`Tuần ${d.week?.index ?? ""} (${fmtDate(d.monday)} – ${fmtDate(addDays(d.monday, 5))})`} icon={<CalendarRange className="size-5 text-primary" />}
                action={<>
                  <Button size="sm" variant="secondary" icon={<ChevronLeft className="size-4" />} onClick={() => setWeek(addDays(d.monday, -7))}>Tuần trước</Button>
                  <Button size="sm" variant="secondary" disabled={d.monday === mondayOf(ctx.today)} onClick={() => setWeek(mondayOf(ctx.today))}>Tuần này</Button>
                  <Button size="sm" variant="secondary" iconRight={<ChevronRight className="size-4" />} onClick={() => setWeek(addDays(d.monday, 7))}>Tuần sau</Button>
                  <Button size="sm" icon={<Download className="size-4" />} disabled={!rows.length} onClick={() => downloadCSV(cols, exportRows(), file)}>CSV</Button>
                  <Button size="sm" icon={<FileSpreadsheet className="size-4" />} disabled={!rows.length} onClick={() => void downloadXLSX(cols, exportRows(), file, { title, subtitle: "Dữ liệu buổi sáng đã lưu; “Chưa điểm danh” không tính là có mặt." })}>XLSX</Button>
                </>} />
              <FilterBar q={text} onQ={setText} placeholder="Tìm học sinh…" active={!!text || !!only} onReset={() => { setText(""); setOnly(""); }}>
                <InlineSelect label="Lọc học sinh" value={only} onChange={setOnly} allLabel="Tất cả học sinh" options={[{ value: "issues", label: "Có đi muộn / nghỉ" }, { value: "unmarked", label: "Có buổi chưa điểm danh" }]} />
              </FilterBar>
              <div className="px-5 pb-3"><StatusLegend extra={[...Object.values(SPECIAL), { abbr: "*", label: "Đã sửa sau lần lưu đầu" }]} /></div>
              {d.rows.length === 0 ? <EmptyState compact title="Không có học sinh trong tuần này" /> : rows.length === 0 ? <EmptyFiltered onReset={() => { setText(""); setOnly(""); }} what="học sinh" /> : (
                <div className="table-wrap" role="region" aria-label="Ma trận chuyên cần" tabIndex={0}>
                  <table className="table [&_td]:!px-2 [&_th]:!px-2" style={{ minWidth: 960 }}>
                    <caption className="sr-only">{title}</caption>
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-[1] bg-[#f5f9ff]">Học sinh</th>
                        {d.days.map((x) => (
                          <th key={x.date} className="center">
                            <Link href={`${base}/attendance?date=${x.date}&slot=morning`} className="hover:underline">{weekdayLabel(weekdayOf(x.date), true)} {fmtDayMonth(x.date)}</Link>
                            <span className="block text-[11px] font-normal">{x.holiday ? `Nghỉ: ${x.holiday}` : x.sessionStatus === "future" ? "Chưa tới" : x.sessionStatus === "none" ? "Chưa điểm danh" : PUBLICATION_STATUS[x.sessionStatus]?.label}</span>
                          </th>
                        ))}
                        <th className="center">C</th><th className="center">M</th><th className="center">P</th><th className="center">K</th><th className="center">Chưa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.studentId}>
                          <td className="sticky left-0 z-[1] bg-white"><p className="whitespace-nowrap font-semibold text-ink">{r.fullName}</p><p className="text-[12px] text-muted">{r.code}</p></td>
                          {r.cells.map((c, i) => {
                            const special = c.status in SPECIAL;
                            const clickable = !special || c.status === "holiday" ? !special : false;
                            const label = `${r.fullName}, ${weekdayLabel(weekdayOf(d.days[i].date))} ${fmtDate(d.days[i].date)}: ${cellLabel(c)}${"note" in c && c.note ? `. Ghi chú: ${c.note}` : ""}`;
                            return (
                              <td key={i} className="center">
                                {clickable ? (
                                  <button type="button" onClick={() => setCell({ studentId: r.studentId, date: d.days[i].date })} aria-label={label} title={label}
                                    className={clsx("inline-flex h-8 min-w-9 items-center justify-center rounded-md px-1.5 text-[12.5px] font-bold hover:ring-2 hover:ring-primary/40", STATUS_STYLE[c.status as AttendanceStatus].chip)}>
                                    {cellText(c)}{"edited" in c && c.edited ? "*" : ""}{"note" in c && c.note ? <span className="ml-0.5 size-1.5 rounded-full bg-current" aria-hidden /> : null}
                                  </button>
                                ) : <span title={label} aria-label={label} className="inline-flex h-8 min-w-9 items-center justify-center rounded-md bg-[#f1f4f8] px-1.5 text-[11.5px] font-bold text-muted">{cellText(c)}</span>}
                              </td>
                            );
                          })}
                          <td className="center tabular-nums">{r.tally.present}</td><td className="center tabular-nums">{r.tally.late}</td><td className="center tabular-nums">{r.tally.excused}</td><td className="center tabular-nums">{r.tally.unexcused}</td><td className="center tabular-nums">{r.tally.unmarked}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-[12.5px] text-muted">
                <span>Tổng cột: C có mặt · M đi muộn · P nghỉ có phép · K nghỉ không phép · Chưa = chưa điểm danh. Bấm một ô để xem ghi chú và lịch sử sửa.</span>
                <Link href={`${base}/attendance`} className="card-link ml-auto"><CalendarCheck className="size-3.5" aria-hidden />Mở bảng điểm danh ngày</Link>
              </div>
              <RecordHistoryDrawer open={!!cell} onOpenChange={(o) => { if (!o) setCell(null); }} schoolId={schoolId} yearId={yearId} classId={classId} target={cell}
                dayHref={cell ? `${base}/attendance?date=${cell.date}&slot=morning` : undefined} />
              {d.days.some((x) => x.periodSessions > 0) && <p className="px-5 pb-4 text-[12px] text-muted">Có điểm danh theo tiết của giáo viên bộ môn trong tuần: {d.days.filter((x) => x.periodSessions).map((x) => `${fmtDayMonth(x.date)} (${x.periodSessions} tiết)`).join(", ")}. <Badge tone="neutral" dot={false}>Không cộng vào ma trận buổi</Badge></p>}
            </Card>
          );
        }}
      </QueryState>
    </div>
  );
}
