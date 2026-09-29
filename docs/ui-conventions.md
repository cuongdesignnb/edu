# EduManage frontend — quy ước lập trình giao diện (dùng chung)

Tài liệu này mô tả cách các màn hình được dựng trên nền tảng đã có. Mọi màn hình dùng **cùng** mô hình dữ liệu, repository mock, component và quyền. Đọc kèm `AGENT-FRONTEND.md`, `docs/01…06` và `docs/BUSINESS-V2.md`.

## 1. Kiến trúc

```
src/lib/model/types.ts            Model frontend (DemoDB) — không phải schema DB
src/lib/fixtures/seed.ts          Seed xác định (PRNG cố định) — 8 trường, A/B đầy đủ, 153 HS
src/lib/permissions/{actions,can} Mô hình quyền duy nhất: grant = hành động × trường × lớp/môn × hiệu lực
src/lib/repositories/*            MockRepository bất đồng bộ (đọc/ghi IndexedDB, BroadcastChannel)
src/lib/query/hooks.ts            useSession, useCtx, useRepo (đọc), useCommand (ghi)
src/components/ui/*               Primitives (button, badge, card, form, combobox, dialog, menu, tabs, states, file, guards…)
src/components/data/*             DataTable, Pagination, BulkSelectionBar, FilterBar, KpiCard, ChartCard
src/components/layout/*           Brand, Sidebar, Topbar, PageHeader, Breadcrumbs, shells (Platform/School/Teacher/Account/Public)
src/features/classroom/context.tsx  ClassroomLayout, useClassroom(), ClassHeader, ClassTabs
src/features/parent/shell.tsx     ParentShell, useParent(), useParentRead(), useParentView()
src/lib/export/index.ts           CSV (BOM), XLSX thật, parse CSV/XLSX cục bộ
src/lib/routing/registry.ts       ID màn hình → URL demo với fixture hợp lệ
```

Layout đã có: `/platform/*` (PlatformShell), `/school/[schoolId]/*` (SchoolShell + `useSchool()`), `/teacher/[schoolId]/*` (TeacherShell), `/classroom/[schoolId]/[yearId]/[classId]/*` (ClassroomLayout tự chọn shell theo quan hệ thật với lớp), `/p/[schoolSlug]/*` (ParentShell; `access` và `access-unavailable` nằm ngoài cổng link).

## 2. Mẫu một trang

```tsx
"use client";
import { use } from "react";
export default function Page({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  const q = useRepo(["key", schoolId, ...], (ctx) => someRepo.fn(ctx, schoolId, ...));
  return (
    <QueryState query={q} skeleton="table">
      {(d) => (
        <div className="page">
          <PageHeader title="…" subtitle="…" breadcrumbs={[…]} actions={…} />
          <Card><CardHeader title="…" icon={<Icon className="size-5" />} action={…} /> … </Card>
        </div>
      )}
    </QueryState>
  );
}
```

- Trang là client component; tham số route qua `use(params)`; query string qua `useSearchParams()` (bọc Suspense nếu Next yêu cầu).
- Đọc dữ liệu **chỉ** qua `useRepo(key, fn)`; ghi **chỉ** qua `useCommand(fn, { success })`. `useCommand` đã chống bấm 2 lần, chỉ toast thành công sau khi ghi xong, lỗi mạng mô phỏng không báo thành công. Trả về `undefined` nếu lỗi → giữ nguyên form.
- Lỗi `VALIDATION` có `error.fieldErrors` → hiển thị đúng field + `ErrorSummary`. Lỗi `CONFLICT` → `ConflictDialog`. Lỗi `DUPLICATE` → hộp thoại xử lý trùng (O18). Các lỗi khác đã toast tự động.
- Trong class workspace: `const { schoolId, yearId, classId, base, header, can, readOnly } = useClassroom();` và đặt `<ClassHeader variant="compact" title="…" />` ở đầu trang (đã gồm breadcrumb + tab lớp). `variant="full"` chỉ cho Tổng quan lớp / Học sinh (bố cục R06).
- Trong school: `const { school, yearId, can } = useSchool();`. Nút/menu chỉ hiện khi `can(action)`; repository vẫn chặn nếu gọi trực tiếp.
- Phụ huynh: `const q = useParentRead([...], (key, slug) => parentRepo.xxx(key, slug, …)); useParentView("module");`. Module chưa cấp → lỗi FORBIDDEN "module" → hiển thị “Mục này chưa được nhà trường chia sẻ”.

## 3. Thành phần bắt buộc dùng lại (không tự chế style)

| Nhu cầu | Dùng |
|---|---|
| Khung trang | `.page`, `PageHeader` (title, subtitle, quote, illustration, breadcrumbs, actions) |
| Thẻ | `Card`, `CardHeader`, `CardLink`, `IconTile`, `Callout`, `InfoRow` |
| Nút | `Button`, `ButtonLink`, `IconButton` (luôn có aria/label) |
| Trạng thái | `Badge`, `StatusBadge`, `PUBLICATION_STATUS` + map trong `@/lib/formatters` — luôn chữ + chấm, không chỉ màu |
| Bảng | `DataTable`, `useListQuery` (repo có paginate) hoặc `useClientList` (mảng nhỏ đã scope), `Pagination`, `BulkSelectionBar`, `FilterBar`, `EmptyFiltered` |
| Form | `TextField`, `TextArea`, `SelectField`, `InlineSelect`, `Combobox`, `DateField` (dd/MM/yyyy), `NumberField`, `Checkbox`, `RadioGroup`, `Toggle`, `ChipToggleGroup`, `ErrorSummary`, `Field` |
| Popup | `Modal`, `Drawer` (mobile full-screen), `BottomSheet`, `ConfirmDialog` (đối tượng + hậu quả + lý do) |
| Menu | `ActionMenu` (hành động dòng) |
| Tab | `Tabs`/`TabPanel` (đồng bộ `?tab=`), `LinkTabs` (tab theo route) |
| Trạng thái trang | `QueryState`, `PageSkeleton`, `EmptyState`, `ErrorState`, `DeniedState` |
| Tiến độ | `ProgressBar` (luôn có tử/mẫu), `DonutProgress`, `Stepper` |
| Lịch sử | `Timeline`, `AuditDiff` |
| Tệp | `FileDropzone`, `FilePreview`, `FileThumb`, `downloadFileAsset` |
| Biểu đồ | `ChartCard` (có “Xem dạng bảng” + mẫu số) |
| Chưa lưu | `useUnsavedChanges(dirty, save?)`; đổi ngữ cảnh: `useLeaveGuard()` |
| Xuất | `downloadCSV`, `downloadXLSX` (`@/lib/export`), in: `window.print()` + class `no-print`/`print-only` |
| Người | `Avatar`, `Identity`, `SchoolMark` (không ảnh người thật) |

Ảnh minh họa có sẵn trong `/assets/illustrations/`: school-header, school-sidebar, role-platform, role-school, role-teacher, role-parent, teachers-trio, teacher-board, students-trio, students-duo, students-pair, kids-school, activity-trophy, activity-stem, activity-clean, family-header, family-sidebar, family-laptop, girl-clipboard, books-plant. Chỉ dùng trang trí; không dựng trang bằng screenshot.

## 4. Quy tắc cứng

1. Tiếng Việt UTF-8 đầy đủ dấu, không emoji, không `href="#"`, không `alert()`, không “Coming soon”. Tích hợp ngoài phạm vi ghi rõ “Mô phỏng/Chưa kết nối” (`DemoTag`).
2. Không khai báo mảng dữ liệu mẫu trong trang. Mọi số (KPI, sĩ số, tỷ lệ) lấy từ repository. Không `Math.random()`.
3. Phân biệt “Đã lưu” / “Đã chốt” / “Đã công bố”. “Chưa điểm danh” không phải có mặt. “Chưa công bố” không hiển thị 0 điểm.
4. Không thêm thanh toán, gói cước, tài khoản/chat/upload cho phụ huynh, module kết quả học tập (EX01–03 tắt).
5. Nhãn quyền bằng tiếng Việt (`ACTION_LABELS`); mã kỹ thuật chỉ ở phần “chi tiết kỹ thuật”.
6. Responsive: 360/390/768/1024/1448. Body không tràn ngang; bảng cuộn trong `.table-wrap`; lưới dùng `grid-cols-1 sm:… xl:…`; form trong Drawer thành full-screen trên điện thoại. Kiểm tra `overflowX` bằng `scripts/shot.mjs`.
7. Mỗi form: validate, hủy không đổi dữ liệu, cảnh báo chưa lưu khi có thay đổi, nút lưu `loading`.
8. Mỗi danh sách: tìm kiếm, lọc, sắp xếp, phân trang thật; trạng thái rỗng khác trạng thái lọc không có kết quả.
9. Không sửa file dùng chung (`src/lib/**`, `src/components/**`, layout) trừ khi được giao; nếu cần hàm repository mới, thêm vào module của phần mình phụ trách, theo mẫu trong `core.ts` (`read`/`write`, `requireAction`, `audit`, `validation`).

## 5. Kiểm tra

- `npx tsc --noEmit` (lọc lỗi theo file của mình khi nhiều người cùng làm).
- Dev server: `http://localhost:3000`. Chụp: `MSYS_NO_PATHCONV=1 node scripts/shot.mjs <route> <out.png> --as=u-lan --w=390 --h=844` (persona: `platform:u-bao`, `u-hanh`, `u-dung`, `u-quan`, `u-lan`, `u-hung`, `u-nam`, `u-khang`, `u-hoa`). Parent: mở `/p/binh-minh/access?t=demo-minhanh-me`.
- Ghi tiến độ vào `qa/status/<nhóm>.json`: `{ "ID": { "status": "built|mock_connected|qa_screenshot", "route": "...", "evidence": ["qa/screenshots/..."], "notes": "..." } }`. Không ghi PASS nếu chưa kiểm.
