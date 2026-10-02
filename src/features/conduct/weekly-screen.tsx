"use client";
import { useMemo, useState } from "react";
import { Trophy, Search, BookOpenCheck } from "lucide-react";
import type { SnapshotRow } from "@/lib/model/types";
import { conductRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDateTime } from "@/lib/formatters";
import { useClassroom, ClassHeader } from "@/features/classroom/context";
import { Card, CardHeader, InfoRow, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, QueryState, Skeleton } from "@/components/ui/states";
import { ConductNav, ModeToggle, PeriodBadge, PeriodStateBanner, WeekSelect, useWeeks, weekLabel, limitsNote } from "./shared";
import { ExplainDrawer, ExportButtons, WeeklyConductTable } from "./week-table";
import { ActionsPanel } from "./publish";

/** CL07 — weekly summary: official snapshot when it exists, otherwise a clearly-labelled preview. */
export function WeeklySummaryScreen() {
  const { schoolId, yearId, classId, header } = useClassroom();
  const { query, weeks, week, setWeek } = useWeeks();
  const wid = week?.id;
  const rec = useRepo(["conduct-records", classId, wid], (ctx) => conductRepo.records(ctx, schoolId, yearId, classId, wid!), { enabled: !!wid });
  const sum = useRepo(["conduct-summary", classId, wid], (ctx) => conductRepo.weekSummary(ctx, schoolId, yearId, classId, wid!), { enabled: !!wid && rec.data?.week.id === wid && !!rec.data.ruleSet });
  const [explain, setExplain] = useState<SnapshotRow | null>(null);
  const statusById = useMemo(() => new Map((rec.data?.records ?? []).map((r) => [r.id, r.status])), [rec.data]);
  const versionById = useMemo(() => new Map((rec.data?.records ?? []).map((r) => [r.id, r.ruleSetVersion])), [rec.data]);
  return (
    <div className="page">
      <ClassHeader title="Tổng hợp thi đua tuần" subtitle="Điểm gốc, cộng, trừ và tổng của từng học sinh — kèm giải trình từng điểm" actions={<ModeToggle />} crumbs={[{ label: "Thi đua", href: `/classroom/${schoolId}/${yearId}/${classId}/conduct` }, { label: "Tổng hợp tuần" }]} />
      <ConductNav weekId={wid} />
      {query.error ? <Card><ErrorState error={query.error} onRetry={() => query.refetch()} /></Card> : (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-3.5">
            {week ? <WeekSelect weeks={weeks} week={week} onChange={setWeek} className="flex-[1_1_320px]" /> : <Skeleton className="h-10 w-80" />}
            {week && <PeriodBadge status={week.status} />}
          </Card>
          <QueryState query={rec} skeleton="table">
            {(d) => !d.ruleSet ? <Card><EmptyState title="Chưa có nội quy ban hành cho tuần này" description="Nhà trường cần ban hành bộ nội quy thi đua trước khi tổng hợp." /></Card> : <QueryState query={sum} skeleton="table">
            {(s) => {
              if(!s.summaryAvailable)return <Card className="p-5"><Callout tone="neutral">Bạn được xem ghi nhận theo nhiệm vụ của mình. Bảng điểm cả lớp cần quyền chủ nhiệm hoặc quyền đọc cấp lớp.</Callout></Card>;
              const official = !!s.snapshot;
              const rows = official ? s.rows : s.preview;
              return (
                <>
                  <PeriodStateBanner status={s.period.status} snapshot={s.snapshot} lockedAt={s.period.lockedAt} lockedByName={s.period.lockedByName} />
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <Card className="min-w-0">
                      <CardHeader title={`Bảng thi đua ${weekLabel(s.week)}`} icon={<Trophy className="size-5 text-primary" />}
                        subtitle={official ? <Badge tone={s.snapshot!.status === "published" ? "success" : "purple"}>Bản chính thức — phiên bản {s.snapshot!.versionNo}</Badge> : <Badge tone="warning" className="!whitespace-normal">Bản xem trước (gồm ghi nhận chờ rà soát) — chưa chính thức</Badge>}
                        action={<ExportButtons rows={rows} fileBase={`thi-dua-${header.class.name}-tuan-${s.week.index}${official ? `-ban-${s.snapshot!.versionNo}` : "-xem-truoc"}`}
                          title={`Thi đua lớp ${header.class.name} — ${weekLabel(s.week)}`} subtitle={official ? `Bản chính thức phiên bản ${s.snapshot!.versionNo} · ${s.ruleSet.name} (bản ${s.ruleSet.versionNo})` : "Bản xem trước — chưa chính thức, gồm ghi nhận chờ rà soát"} />} />
                      <WeeklyConductTable rows={rows} bands={s.ruleSet.bands} caption={`Bảng thi đua tuần ${s.week.index}`} detailsAvailable={s.snapshot?.detailsAvailable ?? true} onExplain={setExplain} />
                    </Card>
                    <div className="space-y-5">
                      <Card>
                        <CardHeader title="Thông tin bảng" icon={<BookOpenCheck className="size-5 text-primary" />} />
                        <dl className="px-5 pb-4">
                          <InfoRow label="Trạng thái"><PeriodBadge status={s.period.status} /></InfoRow>
                          <InfoRow label="Nội quy">{s.ruleSet.name} (bản {s.ruleSet.versionNo})</InfoRow>
                          <InfoRow label="Điểm gốc">{s.ruleSet.baseScore}</InfoRow>
                          <InfoRow label="Giới hạn">{limitsNote(s.ruleSet)}</InfoRow>
                          {official && <>
                            <InfoRow label="Phiên bản">Bản {s.snapshot!.versionNo}</InfoRow>
                            <InfoRow label="Chốt">{fmtDateTime(s.snapshot!.lockedAt)}{s.period.lockedByName ? ` · ${s.period.lockedByName}` : ""}</InfoRow>
                            <InfoRow label="Công bố">{s.snapshot!.publishedAt ? fmtDateTime(s.snapshot!.publishedAt) : "Chưa công bố"}</InfoRow>
                          </>}
                          {!official && <InfoRow label="Chờ rà soát">{s.checks.pending} ghi nhận</InfoRow>}
                        </dl>
                        {official && <div className="px-5 pb-4"><ButtonLink size="sm" variant="secondary" href={`/classroom/${schoolId}/${yearId}/${classId}/publications/${s.snapshot!.id}`} icon={<Search className="size-4" />}>Mở bản kết quả</ButtonLink></div>}
                      </Card>
                      <ActionsPanel s={s} />
                    </div>
                  </div>
                  <ExplainDrawer row={explain} onClose={() => setExplain(null)} ruleSet={s.ruleSet} official={official} weekText={weekLabel(s.week)}
                    statusOf={(id) => statusById.get(id)} versionOf={(id) => versionById.get(id) ?? (official ? s.snapshot!.ruleSetVersionNo : undefined)} />
                </>
              );
            }}
            </QueryState>}
          </QueryState>
        </>
      )}
    </div>
  );
}
