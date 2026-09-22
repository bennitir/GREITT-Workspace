import * as XLSX from "xlsx";

import { cleanWorkKeyCode, normalizeWorkKeyCode } from "@/lib/work10/work-keys";

export type WorkKeyImportErrorCode =
  | "UNSUPPORTED_FILE"
  | "NO_SHEET"
  | "EMPTY_FILE"
  | "TOO_MANY_ROWS"
  | "HEADER_MISSING"
  | "NO_VALID_ROWS";

export class WorkKeyImportError extends Error {
  code: WorkKeyImportErrorCode;

  constructor(code: WorkKeyImportErrorCode) {
    super(code);
    this.name = "WorkKeyImportError";
    this.code = code;
  }
}

export type ParsedWorkKeyImportRow = {
  rowNumber: number;
  code: string;
  normalizedCode: string;
  name: string;
  description: string | null;
  externalId: string | null;
  isActive: boolean | null;
};

export type ParsedWorkKeyImport = {
  sheetName: string;
  rows: ParsedWorkKeyImportRow[];
  ignoredRows: number;
  duplicateRows: number;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES = {
  code: new Set([
    "verklykill", "verklykillnr", "verklykillnumer", "verklykilnumer", "lykill", "lykillnr",
    "workkey", "workkeycode", "key", "code",
  ]),
  name: new Set([
    "heiti", "nafn", "verklykillheiti", "heitiverklykils", "name", "title", "workkeyname",
  ]),
  description: new Set([
    "lysing", "athugasemd", "athugasemdir", "description", "note", "notes",
  ]),
  externalId: new Set([
    "ytraaudkenni", "ytraid", "externalid", "externalcode", "sourceid",
  ]),
  active: new Set([
    "virkur", "virkt", "stada", "status", "active", "isactive",
  ]),
};

function findColumn(normalizedHeaders: string[], aliases: Set<string>) {
  return normalizedHeaders.findIndex((header) => aliases.has(header));
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function parseActive(value: unknown): boolean | null {
  const raw = normalizeHeader(value);
  if (!raw) return null;
  if (["1", "ja", "yes", "true", "virkur", "virkt", "active", "opinn", "open"].includes(raw)) return true;
  if (["0", "nei", "no", "false", "ovirkur", "ovirkt", "inactive", "lokadur", "closed"].includes(raw)) return false;
  return null;
}

export function parseWorkKeyImportFile(buffer: Buffer, fileName: string): ParsedWorkKeyImport {
  if (!/\.(csv|xlsx|xls)$/i.test(fileName)) throw new WorkKeyImportError("UNSUPPORTED_FILE");

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new WorkKeyImportError("NO_SHEET");

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  if (rawRows.length === 0) throw new WorkKeyImportError("EMPTY_FILE");
  if (rawRows.length > 10_001) throw new WorkKeyImportError("TOO_MANY_ROWS");

  let headerIndex = -1;
  let columns: { code: number; name: number; description: number; externalId: number; active: number } | null = null;

  for (let rowIndex = 0; rowIndex < Math.min(rawRows.length, 30); rowIndex += 1) {
    const row = Array.isArray(rawRows[rowIndex]) ? rawRows[rowIndex] : [];
    const headers = row.map(normalizeHeader);
    const code = findColumn(headers, HEADER_ALIASES.code);
    if (code === -1) continue;
    headerIndex = rowIndex;
    columns = {
      code,
      name: findColumn(headers, HEADER_ALIASES.name),
      description: findColumn(headers, HEADER_ALIASES.description),
      externalId: findColumn(headers, HEADER_ALIASES.externalId),
      active: findColumn(headers, HEADER_ALIASES.active),
    };
    break;
  }

  if (headerIndex === -1 || !columns) throw new WorkKeyImportError("HEADER_MISSING");

  const parsed: ParsedWorkKeyImportRow[] = [];
  let ignoredRows = 0;
  let duplicateRows = 0;
  const seen = new Set<string>();

  for (let rowIndex = headerIndex + 1; rowIndex < rawRows.length; rowIndex += 1) {
    const row = Array.isArray(rawRows[rowIndex]) ? rawRows[rowIndex] : [];
    const code = cleanWorkKeyCode(row[columns.code]);
    if (!code) {
      if (row.some((value) => text(value))) ignoredRows += 1;
      continue;
    }

    const normalizedCode = normalizeWorkKeyCode(code);
    if (seen.has(normalizedCode)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(normalizedCode);

    const importedName = columns.name >= 0 ? text(row[columns.name]) : "";
    parsed.push({
      rowNumber: rowIndex + 1,
      code,
      normalizedCode,
      name: importedName || code,
      description: columns.description >= 0 ? text(row[columns.description]) || null : null,
      externalId: columns.externalId >= 0 ? text(row[columns.externalId]) || null : null,
      isActive: columns.active >= 0 ? parseActive(row[columns.active]) : null,
    });
  }

  if (parsed.length === 0) throw new WorkKeyImportError("NO_VALID_ROWS");
  return { sheetName, rows: parsed, ignoredRows, duplicateRows };
}
