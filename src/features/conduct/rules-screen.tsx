"use client";
import { BookOpen, CalendarClock, Calculator, GitCompare, Link2 } from "lucide-react";
import type { ConductRule, RuleSet } from "@/lib/model/types";
import { conductRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, fmtPoints } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, Callout, InfoRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, QueryState } from "@/components/ui/states";
import { ConductNav, Points, RuleIcon, limitsNote } from "./shared";

function RulesTable({ rules }: { rules: ConductRule[] }) {
  const cats = [...new Set(rules.map((r) => r.category))];
  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: 560 }}>
        <thead><tr><th>Mã</th><th>Quy định</th><th>Nhóm</th><th className="num">Điểm</th><th>Ghi chú</th></tr></thead>
        <tbody>
          {cats.flatMap((c) => rules.filter((r) => r.category === c).map((r) => (
            <tr key={r.id}>
              <td className="text-muted">{r.code}</td>
              <td><span className="flex items-center gap-2.5"><RuleIcon icon={r.icon} size={26} /><span className="text-ink">{r.label}</span></span></td>
              <td>{r.category}</td>
              <td className="num"><Points value={r.points} /></td>
              <td className="text-[12.5px]">
                {r.attendanceLink && <Badge tone="info" dot={false} icon={<Link2 className="size-3" />}>Ghi từ điểm danh</Badge>}
                {!r.shareWithParent && <Badge tone="neutral" dot={false}>Không chia sẻ phụ huynh</Badge>}
              </td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}

function diffRules(a: RuleSet, b: RuleSet) {
  const out: string[] = [];
  if (a.baseScore !== b.baseScore) out.push(`Điểm gốc: ${a.baseScore} → ${b.baseScore}`);
  if (a.cap !== b.cap || a.floor !== b.floor) out.push(`Giới hạn: ${limitsNote(a)} → ${limitsNote(b)}`);
  for (const r of b.rules) {
    const o = a.rules.find((x) => x.id === r.id);
    if (!o) out.push(`Thêm “${r.label}” (${fmtPoints(r.points)})`);
    else if (o.points !== r.points) out.push(`“${r.label}”: ${fmtPoints(o.points)} → ${fmtPoints(r.points)}`);
    else if (o.label !== r.label) out.push(`Đổi tên “${o.label}” → “${r.label}”`);
  }
  for (const o of a.rules) if (!b.rules.some((x) => x.id === o.id)) out.push(`Bỏ “${o.label}”`);
  if (JSON.stringify(a.bands) !== JSON.stringify(b.bands)) out.push("Thay đổi ngưỡng xếp loại");
  return out;
}

/** CL12 — rule set in effect at this class (read-only; editing lives in school SC30). */
export function RulesScreen() {
  const { schoolId, yearId, classId, base } = useClassroom();
  const q = useRepo(["conduct-class-rules", classId], (ctx) => conductRepo.classRules(ctx, schoolId, yearId, classId));
  return (
    <div className="page">
      <ClassHeader title="Nội quy áp dụng tại lớp" subtitle="Bộ nội quy nhà trường ban hành, cách tính điểm tuần và thời hạn nhập" crumbs={[{ label: "Thi đua", href: `${base}/conduct` }, { label: "Nội quy" }]} />
      <ConductNav />
      <QueryState query={q} skeleton="detail">
        {(d) => {
          const cur = d.current;
          if (!cur) return <Card><EmptyState title="Chưa có nội quy đang hiệu lực" description="Nhà trường cần ban hành bộ nội quy thi đua (mục Nội quy và phiên bản của trường)." /></Card>;
          const neg = cur.rules.find((r) => r.attendanceLink === "late") ?? cur.rules.find((r) => r.points < 0);
          const pos = cur.rules.find((r) => r.points > 0 && r.points < 5) ?? cur.rules.find((r) => r.points > 0);
          const example = [neg, pos].filter(Boolean) as ConductRule[];
          const sim = conductRepo.simulate(cur, example.map((r) => r.points));
          const changes = d.next ? diffRules(cur, d.next) : [];
          return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="space-y-5">
                <Card>
                  <CardHeader title={cur.name} icon={<BookOpen className="size-5 text-primary" />} subtitle={`Bản ${cur.versionNo} · hiệu lực ${fmtDate(cur.effectiveFrom)} – ${cur.effectiveTo ? fmtDate(cur.effectiveTo) : "chưa đặt ngày kết thúc"}`}
                    action={<Badge tone="success">Đang áp dụng</Badge>} />
                  <dl className="grid gap-x-6 px-5 pb-3 sm:grid-cols-2">
                    <InfoRow label="Điểm gốc mỗi tuần">{cur.baseScore}</InfoRow>
                    <InfoRow label="Giới hạn">{limitsNote(cur)}</InfoRow>
                    <InfoRow label="Xếp loại"><span className="flex flex-wrap gap-1.5">{cur.bands.slice().sort((a, b) => b.min - a.min).map((b) => <Badge key={b.label} tone={b.tone} dot={false}>{b.label}{b.min > -1000 ? ` ≥ ${b.min}` : ""}</Badge>)}</span></InfoRow>
                    <InfoRow label="Ban hành">{cur.publishedAt ? fmtDate(cur.publishedAt) : "—"}</InfoRow>
                  </dl>
                  <RulesTable rules={cur.rules} />
                  <p className="px-5 py-3 text-[12.5px] text-muted">Chỉ xem. Nội quy do nhà trường soạn và ban hành (Nội quy và phiên bản); mỗi thay đổi tạo phiên bản mới có ngày hiệu lực, không áp ngược lên tuần đã chốt.</p>
                </Card>
                {d.next && (
                  <Card>
                    <CardHeader title={`Phiên bản sắp áp dụng: bản ${d.next.versionNo}`} icon={<GitCompare className="size-5 text-primary" />} subtitle={`${d.next.name} · từ ${fmtDate(d.next.effectiveFrom)}`} action={<Badge tone="info">Đã ban hành, chưa hiệu lực</Badge>} />
                    <div className="px-5 pb-5 text-[13.5px]">
                      <p className="mb-2 font-semibold text-ink">Thay đổi so với bản {cur.versionNo}:</p>
                      {changes.length ? <ul className="list-disc space-y-1 pl-5" data-testid="rules-diff">{changes.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="text-muted">Không có thay đổi về điểm.</p>}
                      <p className="mt-2 text-[12.5px] text-muted">Các tuần trước ngày {fmtDate(d.next.effectiveFrom)} (kể cả tuần đã công bố) vẫn tính theo bản {cur.versionNo}.</p>
                    </div>
                  </Card>
                )}
              </div>
              <div className="space-y-5">
                <Card>
                  <CardHeader title="Ví dụ cách tính" icon={<Calculator className="size-5 text-primary" />} />
                  <div className="px-5 pb-5 text-[13.5px]">
                    <p className="text-body">Một tuần có {example.map((r) => `“${r.label}” (${fmtPoints(r.points)})`).join(" và ")}:</p>
                    <p className="mt-2 rounded-xl bg-[#f7fbff] px-4 py-3 text-xl font-extrabold tabular-nums text-ink" data-testid="rules-example">
                      {cur.baseScore}{example.map((r) => ` ${r.points < 0 ? "−" : "+"} ${Math.abs(r.points)}`).join("")} = {sim.total}
                    </p>
                    <p className="mt-2 text-muted">Xếp loại: <b className="text-ink">{sim.grade}</b>. {limitsNote(cur)} Điểm chỉ là ví dụ minh họa phép tính; điểm thật lấy từ ghi nhận đã duyệt.</p>
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Thời hạn và quy trình" icon={<CalendarClock className="size-5 text-primary" />} />
                  <dl className="px-5 pb-4">
                    <InfoRow label="Thời hạn nhập">Trong {cur.entryDeadlineDays} ngày sau sự việc</InfoRow>
                    <InfoRow label="Chốt tuần">{d.policy?.lockBy === "school_leader" ? "Ban giám hiệu" : "Giáo viên chủ nhiệm"}</InfoRow>
                    <InfoRow label="Công bố">{d.policy?.publishBy === "school_leader" ? "Ban giám hiệu" : "Giáo viên chủ nhiệm"}</InfoRow>
                    <InfoRow label="Kết thúc tuần">{d.policy?.weekCloseDay === "monday" ? "Thứ Hai tuần sau" : "Chủ nhật"}</InfoRow>
                  </dl>
                  <Callout className="mx-5 mb-5" tone="info">Ghi nhận mới luôn ở trạng thái “Chờ rà soát”. Phụ huynh chỉ thấy kết quả sau khi công bố, qua đường dẫn riêng của gia đình.</Callout>
                </Card>
              </div>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
