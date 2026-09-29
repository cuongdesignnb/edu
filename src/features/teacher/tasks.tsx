"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { classroomRepo } from "@/lib/repositories";
import { useRepo } from "@/lib/query/hooks";
import { fmtDate, matches } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { InlineSelect } from "@/components/ui/form";
import { FilterBar } from "@/components/data/table";
import { EmptyFiltered, EmptyState, QueryState } from "@/components/ui/states";
import { TaskIcon, TASK_KIND_LABEL, TASK_TONE, taskActionLabel } from "./shared";

const TONE_ORDER: Record<string, number> = { danger: 0, warning: 1, info: 2, neutral: 3 };

/** TE04 — work queue derived from the same business data (attendance, conduct, evidence, announcements). */
export function TeacherTasks({ schoolId }: { schoolId: string }) {
  const q = useRepo(["teacher-tasks", schoolId], (ctx) => classroomRepo.teacherTasks(ctx, schoolId));
  const [kind, setKind] = useState("");
  const [cls, setCls] = useState("");
  const [text, setText] = useState("");
  return (
    <div className="page">
      <PageHeader title="Việc cần xử lý" subtitle="Hạn chốt, bản ghi cần rà soát, minh chứng cần bổ sung — lấy trực tiếp từ dữ liệu lớp"
        breadcrumbs={[{ label: "Việc hôm nay", href: `/teacher/${schoolId}` }, { label: "Việc cần xử lý" }]} illustration="/assets/illustrations/girl-clipboard.png" />
      <QueryState query={q} skeleton="table">
        {(tasks) => <TaskList tasks={tasks} kind={kind} setKind={setKind} cls={cls} setCls={setCls} text={text} setText={setText} />}
      </QueryState>
    </div>
  );
}

type Task = Awaited<ReturnType<typeof classroomRepo.teacherTasks>>[number];

function TaskList({ tasks, kind, setKind, cls, setCls, text, setText }: { tasks: Task[]; kind: string; setKind: (v: string) => void; cls: string; setCls: (v: string) => void; text: string; setText: (v: string) => void }) {
  const classes = useMemo(() => [...new Map(tasks.map((t) => [t.classId, t.className])).entries()].map(([value, label]) => ({ value, label: `Lớp ${label}` })), [tasks]);
  const kinds = useMemo(() => [...new Set(tasks.map((t) => t.kind))].map((k) => ({ value: k, label: TASK_KIND_LABEL[k] ?? k })), [tasks]);
  const rows = useMemo(() => tasks.filter((t) => (!kind || t.kind === kind) && (!cls || t.classId === cls) && matches(text, t.title, t.detail))
    .sort((a, b) => (TONE_ORDER[a.tone] ?? 9) - (TONE_ORDER[b.tone] ?? 9) || (a.due ?? "9").localeCompare(b.due ?? "9")), [tasks, kind, cls, text]);
  const active = !!kind || !!cls || !!text;
  const reset = () => { setKind(""); setCls(""); setText(""); };
  return (
    <Card>
      <CardHeader title={`Danh sách việc (${rows.length}/${tasks.length})`} icon={<ClipboardCheck className="size-5 text-primary" />} />
      <FilterBar q={text} onQ={setText} placeholder="Tìm theo tên việc…" active={active} onReset={reset}>
        <InlineSelect label="Loại việc" value={kind} onChange={setKind} options={kinds} allLabel="Tất cả loại việc" />
        <InlineSelect label="Lớp" value={cls} onChange={setCls} options={classes} allLabel="Tất cả lớp" />
      </FilterBar>
      {tasks.length === 0 ? <EmptyState icon={<CheckCircle2 className="size-6" />} title="Không có việc cần xử lý" description="Khi có buổi chưa điểm danh, ghi nhận chờ rà soát hay minh chứng chờ duyệt, việc sẽ hiện ở đây." />
        : rows.length === 0 ? <EmptyFiltered onReset={reset} what="việc" /> : (
          <ul className="divide-y divide-line border-t border-line">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <TaskIcon kind={t.kind} />
                <div className="min-w-0 flex-[1_1_240px]">
                  <p className="font-semibold text-ink">{t.title}</p>
                  <p className="text-[13px] text-muted">{t.detail}</p>
                </div>
                <span className="text-[12.5px] text-muted">{TASK_KIND_LABEL[t.kind] ?? t.kind} · Lớp {t.className}{t.due ? ` · Hạn ${fmtDate(t.due)}` : ""}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TASK_TONE[t.tone]}`}>{t.status}</span>
                <ButtonLink href={t.href} size="sm" variant="secondary" className="min-w-[104px] justify-center">{taskActionLabel(t)}</ButtonLink>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}
