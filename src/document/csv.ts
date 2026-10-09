import { CsvChunkParser, detectDialect, detectHeader } from '../viewer/plugins/csv/csv-parser';
export function parseEditableCsv(text: string, tab = false) {
  const result = new CsvChunkParser(tab).feed(text, true);
  if (result.errors.length) throw Error(result.errors.join('; '));
  if (result.rows.length > 100000 || result.rows.some(row => row.length > 256)) throw Error('CSV exceeds the safe editable row/column limit.');
  return { rows: result.rows, dialect: result.dialect ?? detectDialect(text, tab), header: detectHeader(result.rows).detectedHeader };
}
export function serializeCsv(rows: string[][], delimiter: string, newline: string, finalNewline: boolean) {
  const field = (value: string) => value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const text = rows.map(row => row.length === 1 && row[0] === '' ? '""' : row.map(field).join(delimiter)).join(newline);
  return text + (finalNewline && rows.length ? newline : '');
}
