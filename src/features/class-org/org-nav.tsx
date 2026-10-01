"use client";
import { LayoutGrid, Users2, Brush } from "lucide-react";
import { LinkTabs } from "@/components/ui/tabs";
import { useClassroom } from "@/features/classroom/context";

/** Sub-navigation inside the "Tổ & sơ đồ" class tab: groups (CL13), seating (CL14), duties (CL16). */
export function ClassOrgNav() {
  const { base, can, header } = useClassroom();
  const items = [
    ...(can("groups.manage") ? [{ href: `${base}/groups`, label: "Tổ & chức vụ", icon: <Users2 /> }] : []),
    ...(can("seating.manage") ? [{ href: `${base}/seating`, label: "Sơ đồ lớp", icon: <LayoutGrid /> }] : []),
    ...(header.nativeActions.some(a => a === "duty.read" || a === "duty.manage") ? [{ href: `${base}/duties`, label: "Trực nhật", icon: <Brush /> }] : []),
  ];
  return <LinkTabs items={items} exactFirst={false} className="no-print w-fit max-w-full overflow-x-auto" />;
}
