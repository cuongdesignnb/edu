"use client";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Users, CalendarCheck } from "lucide-react";
import { registryById } from "@/lib/routing/registry";
import { Breadcrumbs, PageHeader, AppFooter } from "@/components/layout/page";
import { Topbar, GlobalSearch, UserMenu, NotificationBell } from "@/components/layout/topbar";
import { SchoolContextProvider, SchoolYearBar } from "@/components/layout/shells";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel, LinkTabs } from "@/components/ui/tabs";
import { OpenButton } from "../open";
import { NeedPersona, Frame } from "./common";

const A = "demo-school-a";

function ShellLinks({ ids }: { ids: string[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ids.map((id) => {
        const e = registryById(id)!;
        return (
          <li key={id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[13px]">
            <span className="min-w-0"><b className="text-ink">{id}</b> <span className="text-muted">{e.title}</span></span>
            <OpenButton persona={e.persona} href={e.href} />
          </li>
        );
      })}
    </ul>
  );
}

function TabsExample() {
  const [v, setV] = useState("a");
  return (
    <div className="space-y-3">
      <Tabs value={v} onChange={setV} tabs={[{ value: "a", label: "Tổng quan", icon: <LayoutDashboard /> }, { value: "b", label: "Học sinh", icon: <Users /> }, { value: "c", label: "Điểm danh", icon: <CalendarCheck /> }]}>
        <TabPanel value="a"><p className="text-[13px]">Nội dung tab Tổng quan. Tab trong trang đồng bộ tham số <code>?tab=</code> khi không điều khiển bằng state.</p></TabPanel>
        <TabPanel value="b"><p className="text-[13px]">Nội dung tab Học sinh. Tab có thể kèm số đếm lấy từ repository.</p></TabPanel>
        <TabPanel value="c"><p className="text-[13px]">Nội dung tab Điểm danh.</p></TabPanel>
      </Tabs>
      <div className="overflow-x-auto"><LinkTabs items={[{ href: "/preview/components", label: "Component" }, { href: "/preview/states", label: "Trạng thái" }, { href: "/preview/flows", label: "Luồng demo" }]} exactFirst={false} className="w-max" /></div>
      <p className="text-[12.5px] text-muted">Bàn phím: Tab vào hàng tab, mũi tên trái/phải để đổi tab (Radix). Trên điện thoại hàng tab cuộn ngang trong khung, không tràn trang.</p>
    </div>
  );
}

export const LAYOUT_EXAMPLES: Record<string, () => ReactNode> = {
  C001: () => <ShellLinks ids={["PL01", "SC01", "TE01", "CL01", "PA02", "SY01"]} />,
  C002: () => <><p className="mb-2 text-[13px] text-body">Sidebar chỉ hiện trong shell thật (desktop cố định, thu gọn 76px nhớ trong trình duyệt; điện thoại thành drawer). Mở để kiểm tra mục hiện theo quyền:</p><ShellLinks ids={["SC01", "TE01"]} /></>,
  C003: () => (
    <NeedPersona need={{ kind: "any-staff" }} why="Topbar thật cần một vai trò nhân sự (tìm kiếm, thông báo, menu người dùng đọc dữ liệu repository).">
      <Frame className="!p-0 overflow-hidden [&_header]:!static">
        <Topbar onMenu={() => undefined} homeHref="/demo" search={<GlobalSearch schoolId={A} placeholder="Tìm học sinh, lớp, giáo viên…" />} right={<><NotificationBell schoolId={A} /><UserMenu roleLabel="Vai trò demo" /></>} />
      </Frame>
    </NeedPersona>
  ),
  C004: () => (
    <NeedPersona need={{ kind: "staff", userId: "u-hanh" }} why="Bộ chọn năm học đọc ngữ cảnh trường A qua repository (vai trò Quản trị trường A).">
      <SchoolContextProvider schoolId={A} loading={<p className="text-[13px] text-muted">Đang tải ngữ cảnh trường…</p>}>
        {(ctx) => <Frame><div className="flex flex-wrap items-center gap-3"><span className="text-[13px] font-semibold text-ink">{ctx.school.name}</span><SchoolYearBar /></div><p className="mt-2 text-[12.5px] text-muted">Đổi năm học xóa cache truy vấn của năm cũ; có thay đổi chưa lưu sẽ hỏi trước.</p></Frame>}
      </SchoolContextProvider>
    </NeedPersona>
  ),
  C005: () => <Frame><Breadcrumbs items={[{ label: "Trường THPT Bình Minh", href: registryById("SC01")!.href }, { label: "Lớp 10A1", href: registryById("CL01")!.href }, { label: "Điểm danh" }]} /></Frame>,
  C006: () => <Frame><PageHeader title="Tiêu đề trang" subtitle="Mô tả ngắn một dòng" quote={["Mỗi ngày đến trường", "là một ngày vui"]} illustration="/assets/illustrations/students-trio.png" breadcrumbs={[{ label: "Trang chủ", href: "/demo" }, { label: "Ví dụ" }]} actions={<Button variant="primary" size="sm">Hành động chính</Button>} /></Frame>,
  C007: () => <TabsExample />,
  C008: () => (
    <NeedPersona need={{ kind: "any-staff" }} why="Tìm kiếm chỉ trả kết quả trong phạm vi của vai trò hiện tại.">
      <Frame><GlobalSearch schoolId={A} placeholder="Gõ ít nhất 2 ký tự, ví dụ “Minh”" /><p className="mt-2 text-[12.5px] text-muted">Phụ huynh không có ô tìm kiếm toàn hệ thống.</p></Frame>
    </NeedPersona>
  ),
  C009: () => <NeedPersona need={{ kind: "any-staff" }}><Frame className="flex justify-end"><UserMenu roleLabel="Vai trò demo" /></Frame></NeedPersona>,
  C010: () => <Frame className="!p-0 overflow-hidden"><AppFooter /></Frame>,
};

export const LAYOUT_LIVE = ["C003", "C004", "C005", "C006", "C007", "C008", "C009", "C010"];
