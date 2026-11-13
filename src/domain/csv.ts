import { UTM_KEYS, type Report } from './types';

const headers = [
  'línea',
  'url_original',
  'destino',
  'estado',
  'severidad',
  'campo',
  'código',
  'explicación',
  'sugerencia',
  ...UTM_KEYS,
];
const statusLabels = { pass: 'correcto', warning: 'aviso', error: 'error' } as const;

function csvCell(value: string | number): string {
  const text = String(value);
  // The apostrophe is deliberate: spreadsheets must display untrusted values as text.
  // Check after whitespace/control prefixes as spreadsheet importers may strip them.
  const safe = /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** One row per finding; passing links also get a row. No original values are discarded. */
export function exportReportCsv(report: Report): string {
  const rows: (string | number)[][] = [headers];
  for (const result of report.results) {
    const utms = UTM_KEYS.map((key) => {
      const values = result.utms[key] ?? [];
      return values.length > 1 ? JSON.stringify(values) : (values[0] ?? '');
    });
    for (const finding of result.findings.length ? result.findings : [null]) {
      rows.push([
        result.line,
        result.original,
        result.destination ?? '',
        statusLabels[result.status],
        finding ? statusLabels[finding.severity] : '',
        finding?.field ?? '',
        finding?.code ?? '',
        finding?.explanation ??
          'El enlace cumple las reglas configuradas. No se ha comprobado su disponibilidad.',
        finding?.suggestion ?? '',
        ...utms,
      ]);
    }
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
