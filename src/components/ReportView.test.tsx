// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { analyzeLinks } from '../domain/analyze';
import { DEFAULT_RULES } from '../domain/types';
import { ReportView } from './ReportView';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function campaignLink(line: number, campaign = 'invierno_2026', source = 'google') {
  return `https://tienda.example/oferta/${line}?utm_source=${source}&utm_medium=cpc&utm_campaign=${campaign}`;
}

function longReport() {
  return analyzeLinks(
    Array.from({ length: 121 }, (_, index) =>
      campaignLink(index + 1, 'invierno_2026', index === 0 ? 'Google' : 'google'),
    ).join('\n'),
    DEFAULT_RULES,
  );
}

function rowButton(line: number) {
  return screen.getByRole('button', { name: new RegExp(`^Línea ${line}\\.`) });
}

describe('ReportView', () => {
  it('finds human-readable UTM values encoded with percent escapes or plus signs', async () => {
    const user = userEvent.setup();
    const report = analyzeLinks(
      [
        campaignLink(1, 'invierno%202026'),
        campaignLink(2, 'verano_2026', 'bolet%C3%ADn+mensual'),
        campaignLink(3, 'primavera_2026'),
      ].join('\n'),
      DEFAULT_RULES,
    );
    render(<ReportView report={report} stale={false} onExport={vi.fn()} />);
    const search = screen.getByRole('textbox', { name: 'Buscar en el informe' });

    await user.type(search, 'INVIERNO 2026');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(rowButton(1).getAttribute('aria-label')).toContain('Campaña: invierno 2026');

    await user.clear(search);
    await user.type(search, 'boletín mensual');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(rowButton(2).getAttribute('aria-label')).toContain('Fuente: boletín mensual');

    await user.clear(search);
    await user.type(search, 'boleti\u0301n mensual');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(rowButton(2)).toBeTruthy();
  });

  it('exposes source, medium and status in the row name and links details only while they exist', async () => {
    const user = userEvent.setup();
    const report = analyzeLinks(campaignLink(1), DEFAULT_RULES);
    render(<ReportView report={report} stale={false} onExport={vi.fn()} />);
    const row = rowButton(1);
    expect(row.getAttribute('aria-label')).toContain('Fuente: google. Medio: cpc. Sin hallazgos');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(row.hasAttribute('aria-controls')).toBe(false);

    await user.click(row);
    const detailId = row.getAttribute('aria-controls');
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(detailId).not.toBeNull();
    const detail = document.getElementById(detailId!);
    expect(detail).not.toBeNull();
    expect(within(detail!).getByText(campaignLink(1))).toBeTruthy();
    expect(within(detail!).getByText('google')).toBeTruthy();
    expect(within(detail!).getByText('cpc')).toBeTruthy();

    await user.click(row);
    expect(row.hasAttribute('aria-controls')).toBe(false);
    expect(document.getElementById(detailId!)).toBeNull();
  });

  it('shows at most 50 rows, announces the range and navigates both ways to the final partial page', async () => {
    const user = userEvent.setup();
    render(<ReportView report={longReport()} stale={false} onExport={vi.fn()} />);
    const previous = screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement;
    expect(screen.getAllByRole('article')).toHaveLength(50);
    expect(previous.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('1–50 de 121 enlaces');
    expect(document.getElementById(next.getAttribute('aria-controls')!)).not.toBeNull();

    await user.click(next);
    expect(screen.getAllByRole('article')).toHaveLength(50);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('group', { name: 'Enlaces del informe' }),
      ),
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(rowButton(51)).toBeTruthy();
    expect(previous.disabled).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('51–100 de 121 enlaces');

    await user.click(next);
    expect(screen.getAllByRole('article')).toHaveLength(21);
    expect(rowButton(121)).toBeTruthy();
    expect(next.disabled).toBe(true);
    expect(screen.getByText('Página 3 de 3')).toBeTruthy();

    await user.click(previous);
    expect(rowButton(51)).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(50);
  });

  it('returns to the first page when searching or changing status filters', async () => {
    const user = userEvent.setup();
    render(<ReportView report={longReport()} stale={false} onExport={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.type(screen.getByRole('textbox', { name: 'Buscar en el informe' }), 'invierno');
    expect(rowButton(1)).toBeTruthy();
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.click(screen.getByRole('button', { name: /^Sin hallazgos\s+120$/ }));
    expect(rowButton(2)).toBeTruthy();
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      '1–50 de 120 enlaces (121 en el informe)',
    );
  });

  it('recovers from an empty search and keeps export available for the complete report', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const report = analyzeLinks([campaignLink(1), campaignLink(2)].join('\n'), DEFAULT_RULES);
    render(<ReportView report={report} stale={false} onExport={onExport} />);
    await user.type(
      screen.getByRole('textbox', { name: 'Buscar en el informe' }),
      'sin-coincidencias',
    );
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('0 de 2 enlaces');
    expect(screen.queryByRole('navigation', { name: 'Páginas del informe' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(onExport).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('prevents exporting a stale report', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(
      <ReportView
        report={analyzeLinks(campaignLink(1), DEFAULT_RULES)}
        stale
        onExport={onExport}
      />,
    );
    const exportButton = screen.getByRole('button', { name: 'Exportar CSV' }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    await user.click(exportButton);
    expect(onExport).not.toHaveBeenCalled();
  });
});
