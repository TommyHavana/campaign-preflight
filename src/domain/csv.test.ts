import { describe, expect, it } from 'vitest';
import { analyzeLinks } from './analyze';
import { exportReportCsv } from './csv';
import { DEFAULT_RULES, type Report } from './types';

const goodLink =
  'https://tienda.example/lanzamiento?utm_source=google&utm_medium=cpc&utm_campaign=invierno_2026';

// A small CSV reader verifies round trips, including embedded quotes and newlines.
function readCsv(csv: string): string[][] {
  const text = csv.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && character === '\r' && text[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0) rows.push([...row, cell]);
  expect(quoted).toBe(false);
  return rows;
}

function reportWithText(text: string): Report {
  const report = analyzeLinks(goodLink, DEFAULT_RULES);
  const result = report.results[0]!;
  result.original = text;
  result.status = 'warning';
  result.findings = [
    {
      code: 'example',
      severity: 'warning',
      field: 'utm_campaign',
      title: 'Ejemplo',
      explanation: text,
      suggestion: 'Revisar antes de lanzar.',
    },
  ];
  report.summary = { total: 1, pass: 0, warning: 1, error: 0, findings: 1 };
  return report;
}

describe('CSV report export', () => {
  it('exports successful links as well as one row for every finding and retains input line numbers', () => {
    const report = analyzeLinks(`\n${goodLink}\n\nhttps://tienda.example/`, DEFAULT_RULES);
    const rows = readCsv(exportReportCsv(report));
    const headers = rows[0]!;
    const records = rows
      .slice(1)
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
    expect(records).toHaveLength(1 + report.results[1]!.findings.length);
    expect(records[0]).toMatchObject({
      línea: '2',
      url_original: goodLink,
      estado: 'correcto',
      severidad: '',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'invierno_2026',
    });
    expect(records[0]!['código']).toBe('');
    expect(records.slice(1).every((row) => row['línea'] === '4')).toBe(true);
    expect(records.slice(1).map((row) => row['código'])).toEqual(
      report.results[1]!.findings.map((finding) => finding.code),
    );
    expect(rows.every((row) => row.length === headers.length)).toBe(true);
  });

  it('starts with a UTF-8 BOM and uses CRLF record separators', () => {
    const csv = exportReportCsv(analyzeLinks(goodLink, DEFAULT_RULES));
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('exports warning labels in Spanish while retaining stable rule codes', () => {
    const rows = readCsv(exportReportCsv(reportWithText('Revisar campaña')));
    const headers = rows[0]!;
    expect(rows[1]![headers.indexOf('estado')]).toBe('aviso');
    expect(rows[1]![headers.indexOf('severidad')]).toBe('aviso');
    expect(rows[1]![headers.indexOf('código')]).toBe('example');
  });

  it('round trips accented text, commas, quotes, and embedded newlines', () => {
    const text = 'Campaña "invierno", revisión\nSegunda línea';
    const csv = exportReportCsv(reportWithText(text));
    expect(csv).toContain('"Campaña ""invierno"", revisión\nSegunda línea"');
    const rows = readCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.filter((value) => value === text)).toHaveLength(2);
    expect(rows[1]).toHaveLength(rows[0]!.length);
  });

  it.each(['=1+1', '+SUM(1,2)', '-2+3', '@SUM(1,2)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1'])(
    'neutralizes spreadsheet formulas even after leading whitespace: %j',
    (text) => {
      const rows = readCsv(exportReportCsv(reportWithText(text)));
      const headers = rows[0]!;
      const data = rows[1]!;
      expect(data[headers.indexOf('url_original')]).toBe(`'${text}`);
      expect(data[headers.indexOf('explicación')]).toBe(`'${text}`);
    },
  );

  it('also neutralizes formula text copied from decoded UTM values', () => {
    const link = goodLink.replace('utm_source=google', 'utm_source=%3D1%2B1');
    const rows = readCsv(exportReportCsv(analyzeLinks(link, DEFAULT_RULES)));
    const sourceColumn = rows[0]!.indexOf('utm_source');
    expect(rows.slice(1).every((row) => row[sourceColumn] === "'=1+1")).toBe(true);
  });

  it('protects every exported text source, including control-prefixed formula payloads', () => {
    const text = '\u0000\t =1+1';
    const report = reportWithText(text);
    const result = report.results[0]!;
    result.destination = text;
    result.findings[0]!.field = text;
    result.findings[0]!.code = text;
    result.findings[0]!.suggestion = text;
    result.utms.utm_term = [text];
    result.utms.utm_content = [text];
    const rows = readCsv(exportReportCsv(report));
    const headers = rows[0]!;
    for (const column of [
      'url_original',
      'destino',
      'campo',
      'código',
      'explicación',
      'sugerencia',
      'utm_term',
      'utm_content',
    ]) {
      expect(rows[1]![headers.indexOf(column)]).toBe(`'${text}`);
    }
  });

  it('keeps every repeated UTM value as one JSON cell, without allowing embedded CSV rows', () => {
    const link = `${goodLink}&utm_source=${encodeURIComponent('otro,"\r\n=1+1')}`;
    const report = analyzeLinks(link, DEFAULT_RULES);
    const rows = readCsv(exportReportCsv(report));
    const sourceColumn = rows[0]!.indexOf('utm_source');
    expect(rows).toHaveLength(report.summary.findings + 1);
    for (const row of rows.slice(1)) {
      expect(JSON.parse(row[sourceColumn]!)).toEqual(['google', 'otro,"\r\n=1+1']);
    }
  });

  it('exports an empty report as a header only', () => {
    const rows = readCsv(exportReportCsv(analyzeLinks('', DEFAULT_RULES)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.arrayContaining(['línea', 'url_original', 'código', 'explicación', 'utm_campaign']),
    );
  });

  it('does not mutate the report while escaping dangerous CSV cells', () => {
    const report = reportWithText('  =SUM(1,2)');
    const before = structuredClone(report);
    exportReportCsv(report);
    expect(report).toEqual(before);
  });
});
