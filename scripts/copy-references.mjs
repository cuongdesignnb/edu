// Copies the 15 reference PNGs listed in manifests/reference-images.json into
// public/preview-references/ (derived copies for the internal /preview/references gallery).
// Originals in references/ are only READ, never modified. SHA-256 is verified against the manifest.
// Also mirrors qa/screenshots/*.png → public/preview-references/evidence/ and writes an index,
// so /preview/checklist can link evidence. Re-run after new screenshots:  node scripts/copy-references.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifests/reference-images.json"), "utf8"));
const outDir = path.join(root, "public/preview-references");
fs.mkdirSync(outDir, { recursive: true });

let ok = 0;
const problems = [];
for (const img of manifest) {
  const src = path.join(root, img.path);
  if (!fs.existsSync(src)) { problems.push(`${img.id}: thiếu ${img.path}`); continue; }
  const buf = fs.readFileSync(src);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (sha !== img.sha256) problems.push(`${img.id}: SHA-256 khác manifest (${sha.slice(0, 12)}…)`);
  const dest = path.join(outDir, path.basename(img.path));
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== buf.length) fs.writeFileSync(dest, buf);
  ok++;
}

// Evidence mirror (screenshots written by build groups into qa/screenshots).
const shotDir = path.join(root, "qa/screenshots");
const evDir = path.join(outDir, "evidence");
fs.mkdirSync(evDir, { recursive: true });
const shots = fs.existsSync(shotDir) ? fs.readdirSync(shotDir).filter((f) => /\.(png|jpe?g)$/i.test(f)) : [];
for (const f of shots) {
  const src = path.join(shotDir, f);
  const dest = path.join(evDir, f);
  const s = fs.statSync(src);
  if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < s.mtimeMs || fs.statSync(dest).size !== s.size) fs.copyFileSync(src, dest);
}
fs.writeFileSync(path.join(outDir, "evidence-index.json"), JSON.stringify({ generatedAt: new Date().toISOString(), files: shots.sort() }, null, 2));

console.log(`copy-references: ${ok}/${manifest.length} ảnh tham chiếu; ${shots.length} ảnh bằng chứng đã đồng bộ.`);
if (problems.length) { console.log(problems.join("\n")); process.exitCode = 1; }
