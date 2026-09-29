"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Maximize2, ImageIcon } from "lucide-react";
import { fmtBytes } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { REFERENCES, REFERENCE_CATEGORY, REFERENCE_NOTES, referenceUrl, screensUsing, type ReferenceImage } from "./data";

/** DV02 — gallery of the 15 reference images (derived copies in /public/preview-references). */
export function ReferenceGallery() {
  const [open, setOpen] = useState<ReferenceImage | null>(null);
  const cats = (["screens", "planning", "archive"] as const).map((c) => ({ c, items: REFERENCES.filter((r) => r.category === c) }));
  return (
    <div className="page">
      <PageHeader title="Thư viện ảnh tham chiếu" subtitle={`${REFERENCES.length} ảnh theo manifests/reference-images.json — ${cats.map((x) => `${x.items.length} ${REFERENCE_CATEGORY[x.c].label.toLowerCase()}`).join(", ")}.`} />
      <Callout tone="warning" icon={<AlertTriangle />} title="Ảnh là tham chiếu, không phải phê duyệt">
        Ảnh chỉ định hướng bố cục và phong cách. Chữ, số, tài khoản phụ huynh, chat, dấu “Done” trong ảnh không phải yêu cầu nghiệp vụ hay tiến độ.
        Mỗi ảnh bên dưới liệt kê những chi tiết đã được sửa theo docs/03. Bản trong thư mục này là bản sao để xem; ảnh gốc ở references/ không bị sửa.
      </Callout>
      {cats.map(({ c, items }) => (
        <Card key={c}>
          <CardHeader title={`${REFERENCE_CATEGORY[c].label} (${items.length})`} icon={<ImageIcon className="size-5" />} subtitle={REFERENCE_CATEGORY[c].note} />
          <ul className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((r) => {
              const used = screensUsing(r.id);
              return (
                <li key={r.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
                  <button type="button" onClick={() => setOpen(r)} className="group relative block aspect-[4/3] overflow-hidden bg-[#f3f7fc]" aria-label={`Xem ảnh ${r.id} — ${r.title} cỡ đầy đủ`}>
                    <img src={referenceUrl(r)} alt={`${r.id} — ${r.title}`} loading="lazy" className="size-full object-cover object-top transition-transform group-hover:scale-[1.02]" />
                    <span className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-primary-strong shadow"><Maximize2 className="size-4" aria-hidden /></span>
                  </button>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info" dot={false}>{r.id}</Badge>
                      <h2 className="text-[15px] font-bold text-ink">{r.title}</h2>
                    </div>
                    <p className="text-[12.5px] text-muted">{r.width}×{r.height} px · {fmtBytes(r.bytes)} · <span className="break-all">{r.path.split("/").pop()}</span></p>
                    <div>
                      <p className="text-[12.5px] font-semibold text-ink">Đã sửa khi triển khai</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] text-body">
                        {(REFERENCE_NOTES[r.id] ?? []).map((n) => <li key={n}>{n}</li>)}
                      </ul>
                    </div>
                    <p className="text-[12.5px] text-muted">
                      Được tham chiếu bởi {used.length} màn hình{used.length ? ": " : "."}
                      {used.slice(0, 10).map((s, i) => <span key={s.id}>{i > 0 && ", "}<Link href={`/preview/sitemap?q=${s.id}`} className="font-semibold text-primary-strong hover:underline">{s.id}</Link></span>)}
                      {used.length > 10 && ` và ${used.length - 10} màn hình khác`}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="secondary" icon={<Maximize2 className="size-4" />} onClick={() => setOpen(r)}>Xem cỡ đầy đủ</Button>
                      <a href={referenceUrl(r)} target="_blank" rel="noopener" className="btn btn-ghost btn-sm"><ExternalLink className="size-4" aria-hidden />Mở tab mới</a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      <Modal open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }} size="xl" title={open ? `${open.id} — ${open.title}` : ""}
        description={open ? `${open.width}×${open.height} px · tên gốc ${open.original_filename}` : undefined}
        footer={open && <><a href={referenceUrl(open)} target="_blank" rel="noopener" className="btn btn-secondary"><ExternalLink className="size-4" aria-hidden />Mở tab mới</a><Button variant="primary" onClick={() => setOpen(null)}>Đóng</Button></>}>
        {open && (
          <div className="space-y-3">
            <div className="overflow-auto rounded-xl border border-line"><img src={referenceUrl(open)} alt={`${open.id} — ${open.title}`} className="block h-auto max-w-none" style={{ width: open.width }} /></div>
            <Callout tone="warning" title="Nhắc lại các chi tiết đã sửa">
              <ul className="list-disc pl-4">{(REFERENCE_NOTES[open.id] ?? []).map((n) => <li key={n}>{n}</li>)}</ul>
            </Callout>
          </div>
        )}
      </Modal>
    </div>
  );
}
