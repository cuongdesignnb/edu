"use client";
import Link from "next/link";
import {useState} from 'react';
import {ParentPeriodicSection} from '@/features/notebook/parent-periodic';
import { clsx } from "clsx";
import { Award, ChevronRight, Printer, History, Info, CheckCircle2, MinusCircle } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { useParent } from "@/features/parent/shell";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { fmtDate, fmtDateTime, fmtPoints } from "@/lib/formatters";
import { PState, usePRead, useHref, ParentHeader, ParentPage, GRADE_TONE } from "./common";

/** PA04 — published weeks only; never a class ranking, never unpublished results. */
export function ParentConductListView() {
  const [periodType,setPeriodType]=useState<'WEEK'|'MONTH'|'TERM'|'YEAR'>('WEEK');
  const q = usePRead(["conduct"], (k, s) => parentRepo.conductList(k, s));
  const href = useHref();
  return (
    <ParentPage>
      <ParentHeader title="Rèn luyện đã công bố của con" subtitle="Kết quả tuần, tháng, học kỳ và năm nhà trường đã công bố" />
      <label className="block">Kỳ tra cứu<select className="input ml-2" value={periodType} onChange={e=>setPeriodType(e.target.value as typeof periodType)}><option value="WEEK">Tuần</option><option value="MONTH">Tháng</option><option value="TERM">Học kỳ</option><option value="YEAR">Năm</option></select></label>
      {periodType!=='WEEK'?<ParentPeriodicSection periodType={periodType}/>:<PState query={q}>
        {(list) => list.length === 0 ? (
          <Card><EmptyState icon={<Award className="size-6" />} title="Chưa có kết quả công bố" description="Kết quả thi đua chỉ hiện sau khi nhà trường công bố. Chưa công bố không phải là 0 điểm." /></Card>
        ) : (
          <>
            <Card>
              <CardHeader icon={<Award className="size-5" />} title="Các tuần đã công bố" subtitle={`${list.length} tuần`} />
              <ul className="divide-y divide-line">
                {list.map((c) => (
                  <li key={c.periodId}>
                    <Link href={href(`conduct/${c.periodId}`)} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#f7fbff] sm:gap-4">
                      <span className="flex size-12 flex-none flex-col items-center justify-center rounded-full bg-pastel-amber text-warning-text" aria-hidden><span className="text-[17px] font-extrabold leading-none">{c.total}</span><span className="text-[9.5px] font-semibold">điểm</span></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{c.periodLabel}</span>
                        <span className="block text-[12.5px] text-muted"><>{c.startDate&&c.endDate&&<span className="sm:after:content-['_·_']">{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</span>}</><span className="block sm:inline">Công bố {fmtDateTime(c.publishedAt)}</span></span>
                      </span>
                      <span className="flex flex-none flex-wrap items-center justify-end gap-1.5">
                        {c.grade!==null&&<Badge tone={GRADE_TONE(c.gradeTone)}>{c.grade}</Badge>}
                        {c.adjusted && <Badge tone="purple">Đã điều chỉnh</Badge>}
                      </span>
                      <ChevronRight className="size-4 flex-none text-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Callout tone="info" icon={<Info />}>Trang chỉ hiển thị kết quả của con, không có bảng xếp hạng cả lớp. Tuần đang diễn ra hoặc chưa công bố sẽ chưa xuất hiện ở đây.</Callout>
          </>
        )}
      </PState>}
    </ParentPage>
  );
}

const PRINT_CSS = `@media print { header, aside, nav, footer, [role="status"], .demo-banner { display: none !important; } main { padding: 0 !important; } }`;

/** PA05 — official published score, shared lines, pinned rule and own revision history. */
export function ParentConductDetailView({ periodId }: { periodId: string }) {
  const p = useParent();
  const href = useHref();
  const q = usePRead(["conduct", periodId], (k, s) => parentRepo.conductDetail(k, s, periodId));
  return (
    <ParentPage>
      <style>{PRINT_CSS}</style>
      <PState query={q} skeleton="detail" backHref={href("conduct")} backLabel="Về danh sách tuần">
        {(c) => (
          <>
            <ParentHeader title={`Kết quả thi đua · ${c.periodLabel}`} subtitle={[c.startDate&&c.endDate?`${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`:null,c.className?`Lớp ${c.className}`:null].filter(Boolean).join(" · ")}
              back={{ href: href("conduct"), label: "Thi đua đã công bố" }}
              actions={<Button icon={<Printer className="size-4" />} onClick={() => window.print()}>In / lưu PDF</Button>} />
            <div className="print-only mb-2 text-[13px]">
              <p className="font-bold">{p.context.school.name}</p>
              <p>Học sinh: {p.context.student.fullName} {c.className&&<>· Lớp {c.className}</>} · Năm học {p.context.yearLabel}</p>
              <p>Bản công bố {c.versionNo} lúc {fmtDateTime(c.publishedAt)}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardHeader icon={<Award className="size-5" />} title="Cách tính điểm" subtitle={c.ruleSetName?`Quy chế: ${c.ruleSetName}${c.ruleSetVersionNo?` (phiên bản ${c.ruleSetVersionNo})`:""}`:undefined}
                  action={c.grade!==null&&<Badge tone={GRADE_TONE(c.gradeTone)}>{c.grade}</Badge>} />
                <div className="px-5 pb-5">
                  <div className="table-wrap">
                    <table className="table text-[13.5px]">
                      <thead><tr><th>Nội dung</th><th>Ngày</th><th className="num">Điểm</th></tr></thead>
                      <tbody>
                        <tr><td className="font-medium text-ink">Điểm nền</td><td>—</td><td className="num font-semibold tabular-nums">{c.base}</td></tr>
                        {c.items.map((i, idx) => (
                          <tr key={idx}>
                            <td><span className="inline-flex items-center gap-2">{Number(i.points) >= 0 ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <MinusCircle className="size-4 text-danger" aria-hidden />}{i.label}</span>{i.reason&&<span className="mt-0.5 block text-[12.5px] text-muted">{i.reason}</span>}</td>
                            <td className="whitespace-nowrap">{fmtDate(i.date)}</td>
                            <td className={clsx("num font-semibold tabular-nums", Number(i.points) >= 0 ? "text-success-text" : "text-danger-text")}>{fmtPoints(Number(i.points))}</td>
                          </tr>
                        ))}
                        {c.items.length === 0 && <tr><td colSpan={3} className="text-muted">Không có ghi nhận cộng/trừ được chia sẻ trong tuần.</td></tr>}
                      </tbody>
                      <tfoot>
                        <tr><td colSpan={2}>Tổng cộng điểm đã chốt</td><td className="num font-semibold tabular-nums text-success-text">{c.plus}</td></tr>
                        <tr><td colSpan={2}>Tổng trừ điểm đã chốt</td><td className="num font-semibold tabular-nums text-danger-text">{c.minus}</td></tr>
                        <tr><td className="pt-3 font-bold text-ink" colSpan={2}>Tổng điểm chính thức đã công bố</td><td className="num pt-3 text-[18px] font-extrabold tabular-nums text-ink">{c.total}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="mt-3 text-[12.5px] text-muted">Các dòng trên là ghi nhận được nhà trường chia sẻ. Tổng cộng/trừ và tổng chính thức lấy từ bản công bố.{c.minimum!==null&&<> Điểm tối thiểu: {c.minimum}.</>}{c.maximum!==null&&<> Điểm tối đa: {c.maximum}.</>}</p>
                </div>
              </Card>
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader icon={<History className="size-5" />} title="Lịch sử công bố" />
                  <ol className="px-5 pb-5">
                    {c.history.map((h, i) => (
                      <li key={h.versionNo} className="flex items-center gap-3 border-l-2 border-line py-2 pl-4">
                        <span className="min-w-0 flex-1 text-sm"><span className="font-semibold text-ink">Bản {h.versionNo}</span> · {h.publishedAt ? fmtDateTime(h.publishedAt) : "—"}</span>
                        <span className="font-bold tabular-nums text-ink">{h.total} điểm</span>
                        {h.current ? <Badge tone="success">Hiện hành</Badge> : <Badge tone="neutral">Đã thay bằng bản mới</Badge>}
                        {i > 0 && <span className="sr-only">Thay đổi từ {c.history[i - 1].total} lên {h.total}</span>}
                      </li>
                    ))}
                  </ol>
                  {c.history.length > 1 && <p className="px-5 pb-4 text-[13px] text-purple-text">{c.history.map((h) => `Bản ${h.versionNo}: ${h.total}`).join(" → ")}</p>}
                </Card>
                {c.adjusted ? <Callout tone="warning" icon={<Info />} title="Kết quả đã được điều chỉnh">{c.adjustmentNote}</Callout>
                  : <Callout tone="info" icon={<Info />}>Đây là bản công bố chính thức của nhà trường. Kết quả không so sánh với học sinh khác.</Callout>}
              </div>
            </div>
          </>
        )}
      </PState>
    </ParentPage>
  );
}
