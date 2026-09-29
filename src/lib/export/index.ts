"use client";
import Papa from "papaparse";

export interface ExportColumn { key: string; label: string }
export type ExportRow = Record<string, string | number | undefined | null>;

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** UTF-8 CSV with BOM so Excel opens Vietnamese correctly. */
export function toCSV(columns: ExportColumn[], rows: ExportRow[]): string {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))];
  return "﻿" + lines.join("\r\n");
}

export function downloadCSV(columns: ExportColumn[], rows: ExportRow[], fileName: string) {
  downloadBlob(new Blob([toCSV(columns, rows)], { type: "text/csv;charset=utf-8" }), fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
}

/** Real .xlsx workbook (not a renamed CSV). */
export async function buildXLSX(columns: ExportColumn[], rows: ExportRow[], meta?: { title?: string; subtitle?: string }): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = columns.map((c) => ({ value: c.label, fontWeight: "bold" as const, backgroundColor: "#E8F3FF" }));
  const data = [
    ...(meta?.title ? [[{ value: meta.title, fontWeight: "bold" as const }], [{ value: meta.subtitle ?? "" }], []] : []),
    header,
    ...rows.map((r) => columns.map((c) => {
      const v = r[c.key];
      if (typeof v === "number") return { value: v, type: Number };
      return { value: v === undefined || v === null ? "" : String(v), type: String };
    })),
  ];
  return writeXlsxFile(data as any, { columns: columns.map((c) => ({ width: Math.min(40, Math.max(10, c.label.length + 4)) })) } as any).toBlob();
}

export async function downloadXLSX(columns: ExportColumn[], rows: ExportRow[], fileName: string, meta?: { title?: string; subtitle?: string }) {
  const blob = await buildXLSX(columns, rows, meta);
  downloadBlob(blob, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

export function slugFile(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Parse a local CSV/XLSX file into header + rows of strings (nothing leaves the browser). */
export async function parseTabularFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
    const [headers = [], ...rows] = res.data;
    return { headers: headers.map((h) => String(h).trim()), rows: rows.map((r) => r.map((c) => String(c ?? "").trim())) };
  }
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = (await readSheet(file)) as unknown[][];
    const fmt = (v: unknown) => {
      if (v instanceof Date) return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
      return v === null || v === undefined ? "" : String(v).trim();
    };
    const [headers = [], ...rows] = data;
    return { headers: headers.map(fmt), rows: rows.map((r) => r.map(fmt)).filter((r) => r.some(Boolean)) };
  }
  throw new Error("Chỉ hỗ trợ tệp .csv hoặc .xlsx");
}

/** Sample import template generated locally (valid rows + intentionally invalid rows for demo). */
export function sampleImportCSV(): string {
  const cols = [
    { key: "code", label: "Mã HS" }, { key: "name", label: "Họ và tên" }, { key: "dob", label: "Ngày sinh" }, { key: "gender", label: "Giới tính" },
    { key: "gname", label: "Người giám hộ" }, { key: "grel", label: "Quan hệ" }, { key: "gphone", label: "SĐT giám hộ" },
  ];
  const rows = [
    { code: "", name: "Phan Gia Bảo", dob: "12/03/2011", gender: "Nam", gname: "Phan Văn Lực", grel: "Bố", gphone: "0912 000 111" },
    { code: "", name: "Đỗ Khánh Vy", dob: "25/07/2011", gender: "Nữ", gname: "Nguyễn Thị Xuân", grel: "Mẹ", gphone: "0913 000 222" },
    { code: "", name: "Trần Bảo Châu", dob: "02/02/2011", gender: "Nữ", gname: "Trần Văn Khải", grel: "Bố", gphone: "0914 000 333" },
    { code: "", name: "", dob: "05/05/2011", gender: "Nam", gname: "", grel: "", gphone: "" },
    { code: "", name: "Lâm Nhật Minh", dob: "2011-13-40", gender: "Nam", gname: "", grel: "", gphone: "" },
    { code: "", name: "Võ Thanh Tâm", dob: "09/09/2011", gender: "Khác", gname: "", grel: "", gphone: "" },
  ];
  return toCSV(cols, rows);
}
