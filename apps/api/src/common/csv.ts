/**
 * Parser CSV mínimo (spec academy-bulk-import) - sin dependencia:
 * separador `,`, campos entre comillas con escape `""`, \r\n / \n,
 * BOM tolerado. Devuelve matriz de strings (filas × columnas);
 * el consumidor mapea header → columnas.
 *
 * Soporta campos entre comillas con saltos de línea internos
 * (una celda Excel multilínea es un solo campo).
 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Ignora líneas completamente vacías (una sola celda vacía al final
    // del archivo o líneas en blanco intermedias).
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Última fila sin newline final.
  if (field !== "" || row.length) endRow();
  return rows;
}

export const CSV_MAX_ROWS = 500;

/**
 * Mapea filas a objetos por header. Devuelve null si el header no
 * contiene alguna columna requerida (el caller responde 400).
 */
export function csvRowsToObjects(
  rows: string[][],
  required: string[],
): { header: string[]; objects: Record<string, string>[] } | null {
  const header = (rows[0] ?? []).map((h) =>
    h.trim().toLowerCase().normalize("NFC"),
  );
  for (const col of required) {
    if (!header.includes(col)) return null;
  }
  const objects = rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
  return { header, objects };
}
