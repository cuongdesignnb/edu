"use client";
import { clsx } from "clsx";
import { Info } from "lucide-react";
import { parentRepo } from "@/lib/repositories";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { NavIcon } from "@/components/layout/icons";
import { fmtDateLong } from "@/lib/formatters";
import { PState, usePRead, ParentHeader, ParentPage } from "./common";

type Duty = Awaited<ReturnType<typeof parentRepo.duties>>[number];

function DutyList({ items, past }: { items: Duty[]; past?: boolean }) {
  if (!items.length) return <EmptyState compact title={past ? "Chưa có buổi trực nhật đã qua" : "Chưa có lịch trực nhật sắp tới"} description={past ? undefined : "Lịch của con sẽ hiện khi giáo viên công bố phân công."} />;
  return (
    <ul className="divide-y divide-line">
      {items.map((d) => (
        <li key={d.id} className={clsx("flex flex-wrap items-center gap-3 px-5 py-3", past && "opacity-80")}>
          <span className={clsx("icon-tile icon-tile-sm", past ? "tone-neutral" : "tone-green")} aria-hidden><NavIcon name="broom" className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{d.task}</span><span className="text-[12.5px] text-muted">{fmtDateLong(d.date)}{d.groupName ? ` · ${d.groupName}` : ""}</span></span>
          <Badge tone={past ? "neutral" : "info"}>{past ? "Đã qua" : "Sắp tới"}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** PA07 — only the child's own duties (no other students' names). */
export function ParentDutiesView() {
  const q = usePRead(["duties"], (k, s) => parentRepo.duties(k, s));
  return (
    <ParentPage>
      <ParentHeader title="Nhiệm vụ trực nhật của con" subtitle="Chỉ gồm ngày và việc được giao cho con, đã được giáo viên công bố" />
      <PState query={q}>
        {(list) => {
          const up = list.filter((d) => d.upcoming);
          const past = list.filter((d) => !d.upcoming).reverse();
          return (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card><CardHeader icon={<NavIcon name="broom" className="size-5" />} title="Sắp tới" subtitle={`${up.length} buổi`} /><DutyList items={up} /></Card>
              <Card><CardHeader icon={<NavIcon name="calendarCheck" className="size-5" />} title="Đã qua" subtitle={`${past.length} buổi`} /><DutyList items={past} past /></Card>
              <Callout tone="info" icon={<Info />} className="lg:col-span-2">Trang chỉ để gia đình nắm lịch. Việc đổi lịch hoặc thay người trực do giáo viên chủ nhiệm sắp xếp tại lớp.</Callout>
            </div>
          );
        }}
      </PState>
    </ParentPage>
  );
}
