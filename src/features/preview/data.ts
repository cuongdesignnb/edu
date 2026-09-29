/**
 * Internal UI lab (/preview/*) — derived views over the registries and the generated
 * progress file. Nothing here is product data; every count is computed from these sources.
 */
import screensManifest from "@manifests/screens.json";
import componentsManifest from "@manifests/components.json";
import overlaysManifest from "@manifests/overlays.json";
import statesManifest from "@manifests/states.json";
import referenceImages from "@manifests/reference-images.json";
import progress from "@/generated/progress.json";
import { REGISTRY, type RegistryEntry } from "@/lib/routing/registry";
import type { Tone } from "@/lib/formatters";

export type Kind = "screens" | "components" | "overlays" | "states";
export type Status = "not_started" | "in_progress" | "built" | "mock_connected" | "qa_screenshot" | "qa_e2e";

export const STATUS_RANK: Record<Status, number> = { not_started: 0, in_progress: 1, built: 2, mock_connected: 3, qa_screenshot: 4, qa_e2e: 5 };
export const STATUS_META: Record<Status, { label: string; tone: Tone }> = {
  not_started: { label: "Chưa làm", tone: "neutral" },
  in_progress: { label: "Đang làm", tone: "warning" },
  built: { label: "Đã dựng", tone: "info" },
  mock_connected: { label: "Đã nối mock", tone: "purple" },
  qa_screenshot: { label: "Đã QA (ảnh chụp)", tone: "success" },
  qa_e2e: { label: "Đã QA (E2E)", tone: "success" },
};
export const STATUS_ORDER: Status[] = ["not_started", "in_progress", "built", "mock_connected", "qa_screenshot", "qa_e2e"];

export interface ProgressItem { id: string; status: Status; route?: string; evidence: string[]; notes: string; source?: string }

type RawProgress = { id: string; status: string; route?: string; evidence?: string[]; notes?: string; source?: string };
const P = progress as unknown as Record<Kind, RawProgress[]> & { generatedAt: string };

function normalise(s: string): Status {
  return (s in STATUS_RANK ? s : "not_started") as Status;
}

const INDEX: Record<Kind, Map<string, ProgressItem>> = {
  screens: new Map(), components: new Map(), overlays: new Map(), states: new Map(),
};
for (const k of Object.keys(INDEX) as Kind[]) {
  for (const r of P[k] ?? []) INDEX[k].set(r.id, { id: r.id, status: normalise(r.status), route: r.route, evidence: r.evidence ?? [], notes: r.notes ?? "", source: r.source });
}
export const PROGRESS_GENERATED_AT: string = P.generatedAt;

/** Progress of one item; anything missing from progress.json counts as "not_started". */
export function progressOf(kind: Kind, id: string): ProgressItem {
  return INDEX[kind].get(id) ?? { id, status: "not_started", evidence: [], notes: "" };
}
export const isConnected = (s: Status) => STATUS_RANK[s] >= STATUS_RANK.mock_connected;
export const isQa = (s: Status) => STATUS_RANK[s] >= STATUS_RANK.qa_screenshot;
export const isBuilt = (s: Status) => STATUS_RANK[s] >= STATUS_RANK.built;

/* ------------------------------ manifests ------------------------------ */
export interface ComponentDef { id: string; group: string; name: string; variants: string; acceptance: string }
export interface OverlayDef { id: string; title: string; fields: string; acceptance: string }
export interface StateDef { id: string; title: string; acceptance: string }
export const COMPONENTS = componentsManifest as ComponentDef[];
export const OVERLAYS = overlaysManifest as OverlayDef[];
export const STATES = statesManifest as StateDef[];
export const SCREENS = REGISTRY;
export const SCREEN_COUNT = (screensManifest as unknown[]).length;

/* ------------------------------ areas (DV03) ------------------------------ */
export const AREAS: { key: string; label: string; group: string; tone: "blue" | "green" | "amber" | "pink" | "purple" | "neutral" }[] = [
  { key: "account", label: "Tài khoản nhân sự", group: "Tài khoản nhân sự", tone: "blue" },
  { key: "platform", label: "Vận hành nền tảng", group: "Vận hành nền tảng", tone: "purple" },
  { key: "school", label: "Quản trị nhà trường", group: "Quản trị nhà trường", tone: "green" },
  { key: "teacher", label: "Giáo viên", group: "Giáo viên", tone: "amber" },
  { key: "classroom", label: "Không gian lớp", group: "Không gian làm việc của lớp — dùng chung theo quyền", tone: "blue" },
  { key: "parent", label: "Phụ huynh", group: "Tra cứu phụ huynh — chỉ đọc", tone: "pink" },
  { key: "public", label: "Công khai & hệ thống", group: "Trang công khai và trạng thái hệ thống", tone: "neutral" },
  { key: "internal", label: "Nội bộ demo", group: "Bộ công cụ nghiệm thu — chỉ môi trường demo", tone: "amber" },
  { key: "optional", label: "Mở rộng tắt", group: "Mở rộng chỉ dựng khi được bật rõ ràng", tone: "neutral" },
];
export function areaOf(e: RegistryEntry) {
  return AREAS.find((a) => a.group === e.group) ?? AREAS[AREAS.length - 1];
}

export const SCOPE_LABEL: Record<RegistryEntry["scope"], string> = { core: "Lõi", internal: "Nội bộ demo", optional: "Mở rộng (tắt)" };
export const BASIS_LABEL: Record<RegistryEntry["basis"], string> = { reference: "Có ảnh riêng", derived: "Suy ra (derived)" };

export function personaLabel(e: RegistryEntry): string {
  const p = e.persona;
  if (p.kind === "platform") return `Vận hành nền tảng (${p.userId})`;
  if (p.kind === "staff") return PERSONA_NAMES[p.userId] ? `${PERSONA_NAMES[p.userId]} (${p.userId})` : p.userId;
  if (p.kind === "parent") return "Link phụ huynh (mẹ Minh Anh)";
  return "Công khai / không cần phiên";
}
export const PERSONA_NAMES: Record<string, string> = {
  "u-bao": "Trần Quốc Bảo — vận hành", "u-hanh": "Nguyễn Thị Hạnh — QT trường A", "u-dung": "Phạm Quốc Dũng — BGH A", "u-quan": "Trần Minh Quân — giáo vụ A",
  "u-lan": "Cô Lan — GVCN 10A1", "u-hung": "Thầy Hùng — Toán", "u-nam": "Thầy Nam — Vật lý A+B", "u-khang": "Đỗ Minh Khang — QT trường B", "u-hoa": "Cô Hoa — GVCN B/10A1",
};

/**
 * Route tree inside one area: parent = longest other route of the same area that is a
 * segment prefix of this route.
 */
export interface TreeNode { entry: RegistryEntry; children: TreeNode[] }
export function buildTree(entries: RegistryEntry[]): TreeNode[] {
  const segs = (r: string) => r.split("/").filter(Boolean);
  const sorted = [...entries].sort((a, b) => segs(a.route).length - segs(b.route).length || a.id.localeCompare(b.id));
  const nodes = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const e of sorted) {
    const node: TreeNode = { entry: e, children: [] };
    nodes.set(e.id, node);
    const s = segs(e.route);
    let parent: TreeNode | undefined;
    for (const cand of sorted) {
      if (cand.id === e.id || !nodes.has(cand.id)) continue;
      const cs = segs(cand.route);
      if (cs.length < s.length && cs.every((x, i) => x === s[i]) && (!parent || cs.length > segs(parent.entry.route).length)) parent = nodes.get(cand.id);
    }
    if (parent) parent.children.push(node); else roots.push(node);
  }
  const order = (list: TreeNode[]) => { list.sort((a, b) => a.entry.id.localeCompare(b.entry.id, "en", { numeric: true })); list.forEach((n) => order(n.children)); };
  order(roots);
  return roots;
}

/* ------------------------------ reference gallery (DV02) ------------------------------ */
export interface ReferenceImage { id: string; title: string; path: string; original_filename: string; width: number; height: number; bytes: number; sha256: string; category: "screens" | "planning" | "archive" }
export const REFERENCES = referenceImages as ReferenceImage[];
export const referenceUrl = (r: ReferenceImage) => `/preview-references/${r.path.split("/").pop()}`;
export const REFERENCE_CATEGORY: Record<ReferenceImage["category"], { label: string; note: string }> = {
  screens: { label: "Concept màn hình nghiệp vụ", note: "Chuẩn thẩm mỹ cho bố cục, màu, card, bảng và menu — không phải chứng nhận nghiệp vụ đã đúng." },
  planning: { label: "Bảng định hướng (planning)", note: "Chỉ là đầu vào cho các trang /preview/*; không tạo menu “Kế hoạch & Chiến lược” trong sản phẩm." },
  archive: { label: "Lưu trữ", note: "Concept ban đầu, giữ để đủ bộ; nhiều chi tiết đã bị nghiệp vụ mới thay thế." },
};

/** Screens that cite an image (computed from the registry). */
export function screensUsing(refId: string) {
  return REGISTRY.filter((s) => s.refs.includes(refId));
}

/** Per-image corrections — condensed from docs/03-REFERENCE-MAP-AND-CORRECTIONS.md §3. */
export const REFERENCE_NOTES: Record<string, string[]> = {
  R01: [
    "Số liệu minh họa (128 trường, 2.845 giáo viên, 12.430 phụ huynh) không chép — KPI tính từ fixture 8 trường.",
    "“Phụ huynh đã kích hoạt” đổi thành lượt mở link demo; phụ huynh không có tài khoản.",
    "Không gói cước/thanh toán; tạm dừng trường là quyết định vận hành, không xóa dữ liệu.",
  ],
  R02: [
    "Một năm học thống nhất 2026–2027 (năm cũ chỉ lưu trữ); không trộn nhiều năm trong cùng màn hình.",
    "“Phụ huynh đã kích hoạt” → “Link đã cấp / Link đã được mở”.",
    "KPI và việc cần làm dẫn xuất từ cùng store mô phỏng, không số cứng.",
  ],
  R03: [
    "Năm học 2024–2025/2026–2027 mâu thuẫn trong ảnh được thay bằng fixture 2026–2027 + một năm lưu trữ.",
    "Lớp chưa đủ phân công giữ trạng thái nháp, không lấp bằng dữ liệu giả.",
  ],
  R04: [
    "Mã quyền tiếng Anh thay bằng nhãn tiếng Việt (“Nhập điểm danh”, “Công bố thi đua”…); mã chỉ ở chi tiết kỹ thuật.",
    "Quyền = nhiệm vụ × lớp/môn × hiệu lực; không có nút “Toàn quyền tất cả lớp”.",
  ],
  R05: [
    "GVCN không có quyền điểm danh/công bố toàn trường chỉ vì vai trò GVCN.",
    "Tên, avatar, lớp của giáo viên nhất quán xuyên màn hình (Cô Lan: GVCN 10A1, Ngữ văn 10A2).",
  ],
  R06: [
    "Bỏ sidebar/avatar “Quản trị nền tảng” trong lớp — dùng SchoolShell/TeacherShell đúng vai trò.",
    "Sĩ số 42 thống nhất với roster; chức vụ/tổ là dữ liệu học sinh, không phải quyền đăng nhập.",
  ],
  R07: [
    "Tài khoản phụ huynh/đăng nhập bỏ; thay bằng link riêng từng người giám hộ (một em × một trường × một năm).",
    "Nhật ký chỉ ghi “Link cấp cho … được mở”, không khẳng định ai cầm link.",
    "Địa chỉ, điện thoại, CCCD/dân tộc trong ảnh không dùng; dữ liệu giả định, số liên hệ đã che.",
    "QR mã hóa đúng link demo, không URL ngắn chứa mã học sinh.",
  ],
  R08: [
    "KPI điểm danh sửa cho khớp: 42 = 38 đúng giờ + 2 đi muộn + 1 nghỉ phép + 1 không phép.",
    "Phép tính thi đua 100 − 5 + 2 = 97; “Chưa điểm danh” không phải có mặt.",
    "Tách rõ Đã lưu / Đã chốt / Đã công bố.",
  ],
  R09: [
    "Học sinh tự upload và tin nhắn phụ huynh bị bỏ; minh chứng do nhân sự ghi nhận.",
    "“Đã gửi Zalo/đã tải lên” chỉ là nhãn Mô phỏng, không gọi dịch vụ thật.",
  ],
  R10: [
    "Bỏ tên tài khoản, menu tài khoản, đổi trường tùy ý và nút nhắn tin của phụ huynh.",
    "Mục “Kết quả học tập” ngoài phạm vi mặc định (EX01–EX03 tắt).",
    "Khung điện thoại cạnh dashboard chỉ là cách trình bày mockup, không phải phần tử giao diện.",
  ],
  P01: ["Chỉ dùng cho /demo, /preview/references, /preview/sitemap; không tạo menu “Full Sitemap CMS” trong sản phẩm.", "Cây sitemap ở đây được sinh từ registry, không chép từ ảnh."],
  P02: ["“84 màn hình, 18 đã thiết kế” và các dấu Done là chữ minh họa — thống kê thật lấy từ registry + tiến độ có bằng chứng."],
  P03: ["Các tick hoàn thành trong ảnh không phải tiến độ; danh mục C001–C075 lấy từ manifest."],
  P04: ["Chỉ định hướng cách trình bày trạng thái/luồng; mọi ví dụ ở /preview/states và /preview/flows chạy trên repository mock."],
  A01: [
    "Concept cũ: tài khoản phụ huynh, chat, chọn trường đã bị thay thế bởi nghiệp vụ mới.",
    "Chỉ tham khảo cách trình bày giáo viên phụ trách và liên hệ (PA12).",
  ],
};
