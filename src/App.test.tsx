// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { MAX_INPUT_LENGTH, MAX_URL_LENGTH } from './domain/types';

const customLink =
  'https://marca.example/lanzamiento?utm_source=boletin&utm_medium=email&utm_campaign=otono_2026';
const input = () =>
  screen.getByRole('textbox', { name: 'Una URL completa por línea' }) as HTMLTextAreaElement;
const exportButton = () =>
  screen.getByRole('button', { name: 'Exportar CSV' }) as HTMLButtonElement;

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0),
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Recorrido de trabajo y recuperación', () => {
  it('bloquea el CSV de un lote editado y recupera informe y entrada al deshacer Vaciar', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(input(), { target: { value: customLink } });
    expect(exportButton().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Revisar enlaces' }));
    expect(exportButton().disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Vaciar' }));
    expect(input().value).toBe('');
    expect(exportButton().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(input().value).toBe(customLink);
    expect(exportButton().disabled).toBe(false);
    expect(screen.getByRole('heading', { name: 'Tu informe de revisión 1' })).toBeTruthy();
  });

  it('recupera la revisión completa después de iniciar una nueva', async () => {
    const user = userEvent.setup();
    render(<App />);
    const previous = input().value;
    await user.click(screen.getByRole('button', { name: 'Nueva revisión' }));
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(input().value).toBe(previous);
    expect(exportButton().disabled).toBe(false);
  });

  it('permite deshacer un ejemplo y descarta esa recuperación al escribir nuevo trabajo', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(input(), { target: { value: customLink } });
    await user.click(screen.getByRole('button', { name: 'correctos' }));
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(input().value).toBe(customLink);
    await user.click(screen.getByRole('button', { name: 'correctos' }));
    fireEvent.change(input(), { target: { value: `${customLink}&utm_content=nuevo` } });
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
  });

  it('restaura la configuración anterior al deshacer Restablecer reglas', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Ajustar reglas' }));
    const campaign = screen.getByLabelText(
      'Nombre de campaña esperado Opcional',
    ) as HTMLInputElement;
    await user.type(campaign, 'campana_propia');
    await user.click(screen.getByRole('button', { name: 'Restablecer reglas' }));
    expect(campaign.value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(campaign.value).toBe('campana_propia');
  });
});

describe('Validación accesible y coherencia del informe', () => {
  it('mantiene válido el informe al cambiar solo espacios u orden de una lista de reglas', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Ajustar reglas' }));
    fireEvent.change(screen.getByLabelText('Medios permitidos'), {
      target: {
        value: ' affiliate, display, social, referral, organic, email, paid_social, cpc, cpc ',
      },
    });
    await user.click(screen.getByRole('button', { name: 'Volver a la revisión' }));
    expect(exportButton().disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Ajustar reglas' }));
    await user.type(screen.getByLabelText('Nombre de campaña esperado Opcional'), 'otra_campana');
    await user.click(screen.getByRole('button', { name: 'Volver a la revisión' }));
    expect(exportButton().disabled).toBe(true);
  });

  it('asocia el error de dominio con su campo y bloquea el análisis hasta corregirlo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Ajustar reglas' }));
    const domain = screen.getByLabelText('Dominios autorizados Opcional');
    fireEvent.change(domain, { target: { value: 'https://marca.example' } });
    expect(domain.getAttribute('aria-invalid')).toBe('true');
    expect(domain.getAttribute('aria-describedby')).toContain('domain-error');
    expect(document.getElementById('domain-error')?.textContent).toContain('Dominio no válido');
    await user.click(screen.getByRole('button', { name: 'Volver a la revisión' }));
    expect(
      (screen.getByRole('button', { name: 'Revisar enlaces' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    await user.click(within(nav).getByRole('button', { name: /Reglas/ }));
    fireEvent.change(screen.getByLabelText('Dominios autorizados Opcional'), {
      target: { value: 'marca.example' },
    });
    expect(
      screen.getByLabelText('Dominios autorizados Opcional').getAttribute('aria-invalid'),
    ).toBe('false');
  });

  it('conserva íntegra una entrada demasiado grande, la identifica y desactiva el análisis', () => {
    render(<App />);
    const hugeInput = 'a'.repeat(MAX_INPUT_LENGTH + 1);
    fireEvent.change(input(), { target: { value: hugeInput } });
    expect(input().value).toHaveLength(hugeInput.length);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toContain('url-error');
    expect(screen.getByRole('alert').textContent).toContain('1.000.000');
    expect(
      (screen.getByRole('button', { name: 'Revisar enlaces' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('señala el rechazo del motor junto a la entrada y devuelve el foco', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(input(), {
      target: { value: 'https://marca.example/' + 'x'.repeat(MAX_URL_LENGTH) },
    });
    await user.click(screen.getByRole('button', { name: 'Revisar enlaces' }));
    expect(screen.getByRole('alert').textContent).toMatch(/8[.]?192/);
    expect(exportButton().disabled).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });
});
