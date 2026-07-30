/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields (with embedded
 * commas, newlines, and escaped `""` quotes). Good enough for the simple
 * three-column recipient sheets this app expects — not a general-purpose
 * CSV library.
 *
 * Returns rows with their original 1-based line numbers preserved.
 */
export function parseCsv(text: string): Array<{ lineNumber: number; cells: string[] }> {
  const rows: Array<{ lineNumber: number; cells: string[] }> = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let lineNumber = 1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push({ lineNumber, cells: row });
      row = [];
      field = "";
      lineNumber++;
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push({ lineNumber, cells: row });
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted field");
  }

  return rows.filter((r) => r.cells.some((cell) => cell.trim() !== ""));
}

export interface ParsedRecipientRow {
  recipientName: string;
  recipientEmail?: string;
  walletAddress?: string;
}

export interface ParsedRecipientCsv {
  rows: ParsedRecipientRow[];
  errors: string[];
}

const HEADER_ALIASES: Record<string, keyof ParsedRecipientRow> = {
  name: "recipientName",
  recipientname: "recipientName",
  email: "recipientEmail",
  recipientemail: "recipientEmail",
  wallet: "walletAddress",
  walletaddress: "walletAddress",
};

/**
 * Expects a header row with columns for name (required), email, and
 * wallet address (both optional), in any order, matched case-insensitively
 * against HEADER_ALIASES.
 */
export function parseRecipientCsv(text: string): ParsedRecipientCsv {
  let table: Array<{ lineNumber: number; cells: string[] }>;
  try {
    table = parseCsv(text);
  } catch (error) {
    if (error instanceof Error && error.message === "Unterminated quoted field") {
      return { rows: [], errors: ["Unterminated quoted field — check for a stray \" in the file."] };
    }
    throw error;
  }

  if (table.length === 0) {
    return { rows: [], errors: ["The file is empty."] };
  }

  const header = table[0].cells.map((h) => h.trim().toLowerCase());
  const columnIndex: Partial<Record<keyof ParsedRecipientRow, number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key) columnIndex[key] = i;
  });

  if (columnIndex.recipientName === undefined) {
    return { rows: [], errors: ['No "name" column found in the header row.'] };
  }

  const errors: string[] = [];
  const rows: ParsedRecipientRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const { lineNumber, cells: line } = table[i];
    const recipientName = line[columnIndex.recipientName]?.trim();
    if (!recipientName) {
      errors.push(`Row ${lineNumber}: missing name — skipped.`);
      continue;
    }
    const recipientEmail =
      columnIndex.recipientEmail !== undefined ? line[columnIndex.recipientEmail]?.trim() || undefined : undefined;
    const walletAddress =
      columnIndex.walletAddress !== undefined ? line[columnIndex.walletAddress]?.trim() || undefined : undefined;

    rows.push({ recipientName, recipientEmail, walletAddress });
  }

  return { rows, errors };
}
