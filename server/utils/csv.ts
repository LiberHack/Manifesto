import { setResponseHeaders, type H3Event } from "h3";

/**
 * One CSV cell: arrays joined with `; `, quoted when needed, and neutralised
 * against formula injection — a value starting with `=`, `+`, `-`, `@`, tab or
 * carriage return is prefixed with `'` so spreadsheet apps treat it as text.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(header: readonly string[], rows: readonly unknown[][]): string {
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

/**
 * Headers for any export: an attachment that no browser, CDN or proxy may
 * store.
 */
export function setExportHeaders(event: H3Event, filename: string): void {
  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
  });
}
