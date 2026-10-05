"use client";
import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { FileSpreadsheet, FileText, Printer, Download, ArrowRight, Clock, Info } from "lucide-react";
import type { ReportData } from "@/lib/repositories";
import { downloadCSV, downloadXLSX, downloadBlob, slugFile, type ExportColumn, type ExportRow } from "@/lib/export";
import type { ReportDownload } from "@/lib/repositories/connected/reports";
import { RepoError, errorMessage } from "@/lib/repositories/errors";
import { captureStaffAccess } from "@/lib/api/client";
import { fmtDateTime } from "@/lib/formatters";
import { ChartCard } from "@/components/data/charts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { RadioGroup } from "@/components/ui/form";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export type ExportFormat = "csv" | "xlsx" | "print";

/** Columns/rows exactly as displayed (drill-down `_href` is never exported). */
export function reportExportData(data: ReportData): { columns: ExportColumn[]; rows: ExportRow[] } {
  return {
    columns: data.columns.map((c) => ({ key: c.key, label: c.label })),
    rows: data.rows.map((r) => Object.fromEntries(data.columns.map((c) => [c.key, r[c.key] as string | number]))),
  };
}

/** Real local file generation (CSV with BOM / real .xlsx workbook). */
export async function exportReportFile(data: ReportData, fileBase: string, format: "csv" | "xlsx") {
  const { columns, rows } = reportExportData(data);
  const name = slugFile(fileBase) || "bao-cao";
  if (format === "csv") downloadCSV(columns, rows, `${name}.csv`);
  else await downloadXLSX(columns, rows, `${name}.xlsx`, { title: data.title, subtitle: `${data.scopeLabel} · ${data.periodLabel} · Tạo lúc ${fmtDateTime(data.generatedAt)}` });
  return { fileName: `${name}.${format}`, rowCount: rows.length };
}

/** O30 — choose export format; states the exact report, period and scope. */
export function ExportFormatDialog({ open, onOpenChange, data, onRun, busy }: { open: boolean; onOpenChange: (o: boolean) => void; data: ReportData; onRun: (f: ExportFormat) => void; busy?: boolean }) {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Chọn định dạng xuất" description="Máy chủ chụp dữ liệu theo bộ lọc và kiểm tra quyền khi tạo, xử lý và tải tệp. Tệp tải được trong 24 giờ." size="sm" busy={busy}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Hủy</Button><Button variant="primary" loading={busy} icon={<Download className="size-4" />} onClick={() => onRun(format)}>Xuất tệp</Button></>}>
      <div className="space-y-3 text-sm">
        <div className="rounded-xl border border-line bg-[#f7fbff] px-3.5 py-2.5">
          <p className="font-semibold text-ink">{data.title}</p>
          <p className="text-[12.5px] text-muted">{data.periodLabel} · {data.scopeLabel}</p>
          <p className="text-[12.5px] text-muted">{data.rows.length} dòng dữ liệu · {data.columns.length} cột</p>
        </div>
        <RadioGroup label="Định dạng" value={format} onChange={setFormat} options={[
          { value: "xlsx", label: "Excel (.xlsx)", description: "Bảng tính thật, có dòng tiêu đề, phạm vi và thời điểm tạo" },
          { value: "csv", label: "CSV (UTF-8)", description: "Mở được bằng Excel/Google Sheets, giữ đúng tiếng Việt" },
          { value: "print", label: "In / Lưu PDF", description: "Bản in sạch; chọn “Lưu dưới dạng PDF” trong hộp thoại in của trình duyệt" },
        ]} />
      </div>
    </Modal>
  );
}

/**
 * C074 — report viewer with KPIs, chart (table alternative), data table with drill-down,
 * denominators, generated time and real CSV/XLSX/print export.
 */
export function ReportViewer({ data, onExport, canExport = true }: { data: ReportData; fileBase: string; onExport?: (format: "csv" | "xlsx" | "pdf") => Promise<ReportDownload>; canExport?: boolean }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | 'pdf' | null>(null);
  const run = async (format: ExportFormat | 'pdf') => {
    if (busy) return;
    const owner = captureStaffAccess();
    setBusy(format);
    try {
      if (format === "print") {
        setDialog(false);
        await new Promise((r) => setTimeout(r, 60));
        window.print();
      } else {
        if (!canExport || !onExport) throw new RepoError("FORBIDDEN", "Chức năng xuất tệp chưa được xác nhận trong phạm vi này.");
        const file = await onExport(format);
        file.assertCurrent();
        downloadBlob(file.blob, file.filename);
        toast.push({ tone: "success", title: `Đã tải tệp ${file.filename}`, detail: "Bản xuất được máy chủ lưu theo dữ liệu tại thời điểm tạo." });
        setDialog(false);
      }
    } catch (error) {
      try {owner.assertCurrent();} catch {return;}
      toast.push({ tone: "error", title: "Không tải được tệp", detail: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };
  const hasHref = data.rows.some((r) => typeof r._href === "string");
  return (
    <div className="space-y-5 report-print">
      <div className="print-only mb-4 border-b border-line pb-3">
        <p className="text-[12px] text-muted">EduManage — bản in báo cáo</p>
        <h1 className="text-2xl font-extrabold text-ink">{data.title}</h1>
        <p className="text-sm text-body">{data.scopeLabel}</p>
        <p className="text-sm text-body">Kỳ báo cáo: {data.periodLabel} · Tạo lúc {fmtDateTime(data.generatedAt)}</p>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        <p className="mr-auto flex items-center gap-1.5 text-[13px] text-muted"><Clock className="size-4" aria-hidden />Tạo lúc {fmtDateTime(data.generatedAt)} · {data.periodLabel}</p>
        {canExport && <Button size="sm" icon={<FileText className="size-4" />} loading={busy === "csv"} onClick={() => run("csv")}>Tải CSV</Button>}
        {canExport && <Button size="sm" icon={<FileSpreadsheet className="size-4" />} loading={busy === "xlsx"} onClick={() => run("xlsx")}>Tải Excel (.xlsx)</Button>}
        {canExport && data.type==='parent-conduct'&&<Button size="sm" variant="primary" icon={<FileText className="size-4" />} loading={busy==='pdf'} onClick={()=>run('pdf')}>Tải PDF phiếu phụ huynh</Button>}
        <Button size="sm" icon={<Printer className="size-4" />} onClick={() => run("print")}>In / Lưu PDF</Button>
        {canExport ? <Button size="sm" variant="primary" icon={<Download className="size-4" />} onClick={() => setDialog(true)}>Xuất báo cáo</Button>
          : <span className="text-[12px] text-muted">Bạn không có quyền xuất tệp dữ liệu.</span>}
      </div>
      {data.kpis.length > 0 && (
        <div className={clsx("grid grid-cols-1 gap-3 sm:grid-cols-2", data.kpis.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
          {data.kpis.map((k) => (
            <div key={k.label} className="card card-pad min-w-0">
              <p className="text-[13px] font-medium text-body">{k.label}</p>
              <p className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight text-ink tabular-nums">{k.value}</p>
              {k.hint && <p className="text-[12px] text-muted">{k.hint}</p>}
            </div>
          ))}
        </div>
      )}
      {data.chart && <ChartCard title={data.chart.title} series={data.chart.series} kind={data.chart.kind} unit={data.chart.unit} denominatorLabel={data.chart.denominatorLabel} />}
      <Card>
        <CardHeader title="Bảng số liệu" subtitle={data.subtitle} action={<span className="text-[12.5px] text-muted">{data.rows.length} dòng</span>} />
        {data.rows.length ? (
          <div className="table-wrap px-4 pb-4" tabIndex={0} role="region" aria-label={`Bảng: ${data.title}`}>
            <table className="table" style={{ minWidth: Math.max(560, data.columns.length * 110) }}>
              <caption className="sr-only">{data.title}</caption>
              <thead><tr>{data.columns.map((c) => <th key={c.key} className={clsx(c.align === "right" && "num", c.align === "center" && "center")}>{c.label}</th>)}{hasHref && <th className="no-print"><span className="sr-only">Chi tiết</span></th>}</tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {data.columns.map((c, j) => <td key={c.key} className={clsx(c.align === "right" && "num tabular-nums", c.align === "center" && "center", j === 0 && "font-semibold text-ink")}>{r[c.key] === "" || r[c.key] === undefined ? "—" : r[c.key]}</td>)}
                    {hasHref && <td className="no-print">{typeof r._href === "string" && <Link href={r._href} className="card-link whitespace-nowrap">Xem lớp<ArrowRight className="size-3.5" aria-hidden /></Link>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState compact title="Không có dữ liệu trong phạm vi đã chọn" description="Đổi khoảng thời gian hoặc bộ lọc để xem số liệu." />}
      </Card>
      <div className="flex gap-2.5 rounded-xl border border-line bg-white px-4 py-3 text-[13px] text-body">
        <Info className="mt-0.5 size-4 flex-none text-primary" aria-hidden />
        <ul className="space-y-0.5">
          <li>Phạm vi: {data.scopeLabel}. Thời điểm tạo: {fmtDateTime(data.generatedAt)}.</li>
          {data.chart && <li>Mẫu số: {data.chart.denominatorLabel}.</li>}
          {data.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </div>
      <ExportFormatDialog open={dialog} onOpenChange={setDialog} data={data} onRun={run} busy={!!busy} />
    </div>
  );
}
