// Merge qa/status/*.json (written by each build group, evidence-based) with the original
// manifests → src/generated/progress.json (read by /preview/*) and docs/progress.md.
// Items without a status entry stay "not_started". Nothing is marked done without evidence.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const screens = read("manifests/screens.json");
const components = read("manifests/components.json");
const overlays = read("manifests/overlays.json");
const states = read("manifests/states.json");

const statusDir = path.join(root, "qa/status");
const merged = { screens: {}, components: {}, overlays: {}, states: {} };
const rank = { not_started: 0, in_progress: 1, built: 2, mock_connected: 3, qa_screenshot: 4, qa_e2e: 5 };
for (const f of fs.existsSync(statusDir) ? fs.readdirSync(statusDir).filter((x) => x.endsWith(".json")) : []) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(statusDir, f), "utf8")); } catch (e) { console.warn("skip", f, e.message); continue; }
  for (const kind of ["screens", "components", "overlays", "states"]) {
    for (const [id, v] of Object.entries(data[kind] ?? {})) {
      const cur = merged[kind][id];
      const entry = { ...v, source: f.replace(/\.json$/, "") };
      if (!cur || (rank[v.status] ?? 0) > (rank[cur.status] ?? 0)) merged[kind][id] = { ...cur, ...entry, evidence: [...new Set([...(cur?.evidence ?? []), ...(v.evidence ?? [])])] };
      else merged[kind][id] = { ...cur, evidence: [...new Set([...(cur.evidence ?? []), ...(v.evidence ?? [])])], notes: [cur.notes, v.notes].filter(Boolean).join(" | ") };
    }
  }
}

const withStatus = (list, kind) => list.map((x) => ({ id: x.id, status: merged[kind][x.id]?.status ?? "not_started", route: merged[kind][x.id]?.route, evidence: merged[kind][x.id]?.evidence ?? [], notes: merged[kind][x.id]?.notes ?? "", source: merged[kind][x.id]?.source }));
const out = {
  generatedAt: new Date().toISOString(),
  note: "Trạng thái lấy từ qa/status/*.json do từng nhóm ghi kèm bằng chứng; mục không có bằng chứng giữ not_started.",
  screens: withStatus(screens, "screens"),
  components: withStatus(components, "components"),
  overlays: withStatus(overlays, "overlays"),
  states: withStatus(states, "states"),
};
fs.mkdirSync(path.join(root, "src/generated"), { recursive: true });
fs.writeFileSync(path.join(root, "src/generated/progress.json"), JSON.stringify(out, null, 2));

const LABEL = { not_started: "chưa làm", in_progress: "đang làm", built: "đã dựng", mock_connected: "đã nối mock", qa_screenshot: "đã QA (ảnh chụp)", qa_e2e: "đã QA (E2E)" };
const count = (arr, pred) => arr.filter(pred).length;
const done = (s) => (rank[s] ?? 0) >= rank.mock_connected;
let md = `# Tiến độ triển khai theo ID\n\n> Tự sinh bởi \`npm run progress\` lúc ${out.generatedAt}. Nguồn: \`qa/status/*.json\` (bằng chứng của từng nhóm) + manifest gốc. Mục không có bằng chứng giữ **chưa làm**. Không có mục nào được đánh dấu chỉ vì có tiêu đề.\n\n`;
const sc = out.screens;
md += `| Nhóm | Tổng | Đã nối mock trở lên | Đã QA (ảnh) | Đã QA (E2E) |\n|---|---|---|---|---|\n`;
for (const scope of ["core", "internal", "optional"]) {
  const ids = screens.filter((s) => s.scope === scope).map((s) => s.id);
  const rows = sc.filter((s) => ids.includes(s.id));
  md += `| Màn hình ${scope} | ${rows.length} | ${count(rows, (r) => done(r.status))} | ${count(rows, (r) => rank[r.status] >= rank.qa_screenshot)} | ${count(rows, (r) => r.status === "qa_e2e")} |\n`;
}
for (const [k, arr] of [["Component", out.components], ["Overlay", out.overlays], ["Trạng thái", out.states]]) {
  md += `| ${k} | ${arr.length} | ${count(arr, (r) => done(r.status))} | ${count(arr, (r) => rank[r.status] >= rank.qa_screenshot)} | ${count(arr, (r) => r.status === "qa_e2e")} |\n`;
}
md += `\n## Màn hình\n\n| ID | Tên | Phạm vi | Route demo | Trạng thái | Bằng chứng | Ghi chú / còn thiếu |\n|---|---|---|---|---|---|---|\n`;
for (const s of screens) {
  const m = sc.find((x) => x.id === s.id);
  md += `| ${s.id} | ${s.title} | ${s.scope} | ${m.route ? "`" + m.route + "`" : "—"} | ${LABEL[m.status] ?? m.status} | ${m.evidence.length ? m.evidence.map((e) => `[ảnh](../${e})`).join(" ") : "—"} | ${(m.notes || (s.scope === "optional" ? "Tắt mặc định (ENABLE_ACADEMIC_RESULTS_PREVIEW=false) — không triển khai." : "")).replace(/\|/g, "/").replace(/\n/g, " ")} |\n`;
}
for (const [title, list, arr] of [["Component", components, out.components], ["Overlay / form", overlays, out.overlays], ["Trạng thái", states, out.states]]) {
  md += `\n## ${title}\n\n| ID | Tên | Trạng thái | Bằng chứng / nơi dùng | Ghi chú |\n|---|---|---|---|---|\n`;
  for (const x of list) {
    const m = arr.find((y) => y.id === x.id);
    md += `| ${x.id} | ${x.name ?? x.title} | ${LABEL[m.status] ?? m.status} | ${m.route ? "`" + m.route + "`" : ""} ${m.evidence.map((e) => `[ảnh](../${e})`).join(" ")} | ${(m.notes || "").replace(/\|/g, "/").replace(/\n/g, " ")} |\n`;
  }
}
fs.writeFileSync(path.join(root, "docs/progress.md"), md);
console.log(`progress: screens ${count(sc, (r) => done(r.status))}/${sc.length} connected; components ${count(out.components, (r) => done(r.status))}/${out.components.length}; overlays ${count(out.overlays, (r) => done(r.status))}/${out.overlays.length}; states ${count(out.states, (r) => done(r.status))}/${out.states.length}`);
