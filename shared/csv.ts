export type CsvCell = string | number | boolean | null | undefined;

/** Spreadsheet downloads need both CSV escaping and formula neutralization. */
export function encodeCsvCell(value: CsvCell): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("CSV numbers must be finite.");
    return String(value);
  }
  const text = value == null ? "" : String(value);
  // Normalize only for detection: preserve the user's actual text in the file.
  const probe = text.normalize("NFKC").replace(/^[\p{White_Space}\p{Cc}\p{Cf}]*/u, "");
  const safe = /^[=+@-]/.test(probe) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function serializeCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map(row => row.map(encodeCsvCell).join(",")).join("\r\n");
}
