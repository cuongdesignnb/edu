/**
 * Synthetic demo files: rendered as SVG so no real photos or documents are needed.
 * Every image carries the watermark "Dữ liệu minh họa".
 */
const PALETTE: Record<string, [string, string, string]> = {
  poster: ["#e8f3ff", "#0a72e6", "#f59e0b"],
  plant: ["#e8f8f1", "#0e9f6e", "#65a30d"],
  notebook: ["#fff5e3", "#f59e0b", "#0a72e6"],
  model: ["#f2eeff", "#7c5ce0", "#0e9f6e"],
  cleaning: ["#eaf3ff", "#0891b2", "#0e9f6e"],
  drawing: ["#fdedf0", "#e5484d", "#f59e0b"],
};

function shapes(pattern: string, a: string, b: string) {
  switch (pattern) {
    case "plant": return `<rect x="150" y="150" width="100" height="70" rx="10" fill="${b}"/><path d="M200 150 C 170 100 120 100 110 70 C 160 70 190 100 200 150 Z" fill="${a}"/><path d="M200 150 C 230 90 280 90 290 60 C 240 60 210 100 200 150 Z" fill="${a}" opacity=".8"/>`;
    case "notebook": return `<rect x="110" y="60" width="180" height="160" rx="12" fill="#fff" stroke="${a}" stroke-width="6"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="135" y="${90 + i * 24}" width="${130 - (i % 2) * 40}" height="8" rx="4" fill="${b}" opacity=".6"/>`).join("")}`;
    case "model": return `<polygon points="200,60 290,120 200,180 110,120" fill="${a}"/><polygon points="110,120 200,180 200,230 110,170" fill="${b}"/><polygon points="290,120 200,180 200,230 290,170" fill="${a}" opacity=".7"/>`;
    case "cleaning": return `<rect x="170" y="110" width="70" height="100" rx="8" fill="${b}"/><rect x="160" y="96" width="90" height="18" rx="6" fill="${a}"/><path d="M110 210 L150 90" stroke="${a}" stroke-width="10" stroke-linecap="round"/><path d="M95 215 h40 l-8 -25 h-24 z" fill="${b}"/>`;
    case "drawing": return `<circle cx="160" cy="120" r="46" fill="${a}" opacity=".8"/><circle cx="245" cy="140" r="36" fill="${b}"/><path d="M110 210 Q200 150 290 210" stroke="${a}" stroke-width="8" fill="none"/>`;
    default: return `<rect x="120" y="60" width="160" height="150" rx="14" fill="#fff" stroke="${a}" stroke-width="6"/><circle cx="200" cy="120" r="30" fill="${b}"/><rect x="150" y="165" width="100" height="12" rx="6" fill="${a}"/>`;
  }
}

export function syntheticImageSVG(pattern: string, caption: string): string {
  const [bg, a, b] = PALETTE[pattern] ?? PALETTE.poster;
  const safe = caption.replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"><rect width="400" height="300" fill="${bg}"/>${shapes(pattern, a, b)}<rect x="0" y="252" width="400" height="48" fill="#ffffff" opacity=".86"/><text x="200" y="274" text-anchor="middle" font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="14" font-weight="600" fill="#10234A">${safe}</text><text x="200" y="291" text-anchor="middle" font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="11" fill="#5c7091">Dữ liệu minh họa — không phải ảnh thật</text></svg>`;
}

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const DOCS: Record<string, { title: string; lines: string[] }> = {
  "doc-rules": { title: "Nội quy lớp (bản minh họa)", lines: ["1. Đi học đúng giờ, mặc đồng phục theo quy định.", "2. Giữ gìn vệ sinh lớp học, bảo vệ tài sản chung.", "3. Tôn trọng thầy cô, đoàn kết giúp đỡ bạn bè.", "4. Hoàn thành bài tập và nhiệm vụ được giao."] },
  "doc-plan": { title: "Kế hoạch (bản minh họa)", lines: ["Mục tiêu: nâng cao nề nếp và chất lượng học tập.", "Tuần 1–2: ổn định tổ chức lớp.", "Tuần 3–4: phát động phong trào thi đua.", "Đánh giá cuối tháng theo nội quy đã ban hành."] },
  "doc-groups": { title: "Danh sách tổ và chức vụ (minh họa)", lines: ["Tổ 1, Tổ 2, Tổ 3, Tổ 4 theo sơ đồ lớp.", "Chức vụ học sinh là dữ liệu tổ chức lớp,", "không phải tài khoản đăng nhập."] },
  "doc-report": { title: "Phiếu liên lạc (bản minh họa)", lines: ["Chuyên cần: theo dữ liệu đã công bố.", "Thi đua: theo các tuần đã công bố.", "Nhận xét của giáo viên chủ nhiệm: (mẫu)."] },
};

export function syntheticDoc(pattern: string) {
  return DOCS[pattern] ?? { title: "Tài liệu minh họa", lines: ["Nội dung mẫu cho bản demo."] };
}
