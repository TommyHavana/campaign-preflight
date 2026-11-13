import { UTM_KEYS, type RuleValidationErrors, type UtmKey } from '../domain/types';
import type { RuleSettings } from '../state/settings';
import { Icon } from './Icon';

export function RulesEditor({
  settings,
  onChange,
  onReset,
  fieldErrors,
}: {
  settings: RuleSettings;
  onChange: (change: Partial<RuleSettings>) => void;
  onReset: () => void;
  fieldErrors: RuleValidationErrors;
}) {
  const errors = Object.values(fieldErrors).flat();
  function toggleRequired(key: UtmKey) {
    onChange({
      requiredUtms: settings.requiredUtms.includes(key)
        ? settings.requiredUtms.filter((item) => item !== key)
        : [...settings.requiredUtms, key],
    });
  }
  return (
    <div className="rules-page">
      <div className="page-heading">
        <div>
          <h1>Tu campaña, tus reglas.</h1>
          <p>Define qué debe cumplir un enlace antes de salir.</p>
        </div>
        <button className="button secondary" onClick={onReset}>
          <Icon name="refresh" size={16} />
          Restablecer reglas
        </button>
      </div>
      <div className="rules-grid">
        <section className="panel rule-panel">
          <div className="panel-title">
            <Icon name="link" />
            <h2>Parámetros de campaña</h2>
          </div>
          <fieldset>
            <legend>UTM obligatorios</legend>
            <p className="field-help">Un parámetro ausente o vacío se marcará como error.</p>
            <div className="utm-checkboxes">
              {UTM_KEYS.map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={settings.requiredUtms.includes(key)}
                    onChange={() => toggleRequired(key)}
                  />
                  <code>{key}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field-label" htmlFor="mediums">
            Medios permitidos
          </label>
          <textarea
            id="mediums"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(fieldErrors.allowedMediums?.length)}
            className="small-textarea"
            value={settings.mediumsText}
            onChange={(event) => onChange({ mediumsText: event.target.value })}
            rows={3}
            aria-describedby={`medium-help${fieldErrors.allowedMediums?.length ? ' medium-error' : ''}`}
          />
          <FieldErrors id="medium-error" errors={fieldErrors.allowedMediums} />
          <p id="medium-help" className="field-help">
            Separados por comas o saltos de línea. Vacío permite cualquier medio. La coincidencia es
            exacta.
          </p>
          <label className="field-label" htmlFor="campaign">
            Nombre de campaña esperado <span>Opcional</span>
          </label>
          <input
            id="campaign"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(fieldErrors.expectedCampaign?.length)}
            className="text-input"
            value={settings.expectedCampaign}
            onChange={(event) => onChange({ expectedCampaign: event.target.value })}
            placeholder="Ej. invierno_2026"
            aria-describedby={`campaign-help${fieldErrors.expectedCampaign?.length ? ' campaign-error' : ''}`}
          />
          <FieldErrors id="campaign-error" errors={fieldErrors.expectedCampaign} />
          <p id="campaign-help" className="field-help">
            Exige este valor exacto en utm_campaign, aunque no esté marcado como obligatorio.
          </p>
        </section>
        <div className="rules-column">
          <section className="panel rule-panel">
            <div className="panel-title">
              <Icon name="globe" />
              <h2>Destino del enlace</h2>
            </div>
            <Toggle
              label="Exigir HTTPS"
              description="Marca los enlaces HTTP como error."
              checked={settings.requireHttps}
              onChange={(value) => onChange({ requireHttps: value })}
            />
            <label className="field-label" htmlFor="domains">
              Dominios autorizados <span>Opcional</span>
            </label>
            <textarea
              id="domains"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={Boolean(fieldErrors.allowedDomains?.length)}
              className="small-textarea"
              rows={2}
              value={settings.domainsText}
              onChange={(event) => onChange({ domainsText: event.target.value })}
              placeholder="atelier.example, tienda.atelier.example"
              aria-describedby={`domain-help${fieldErrors.allowedDomains?.length ? ' domain-error' : ''}`}
            />
            <FieldErrors id="domain-error" errors={fieldErrors.allowedDomains} />
            <p id="domain-help" className="field-help">
              Solo dominios, sin https:// ni rutas. Separados por comas o saltos de línea. Vacío
              permite cualquier dominio.
            </p>
            <Toggle
              label="Incluir subdominios"
              description="Permite tienda.atelier.example al autorizar atelier.example."
              checked={settings.includeSubdomains}
              onChange={(value) => onChange({ includeSubdomains: value })}
            />
          </section>
          <section className="panel rule-panel">
            <div className="panel-title">
              <Icon name="sliders" />
              <h2>Consistencia de los UTM</h2>
            </div>
            <Toggle
              label="Recomendar minúsculas"
              description="Avisa si un valor UTM contiene mayúsculas."
              checked={settings.lowercaseValues}
              onChange={(value) => onChange({ lowercaseValues: value })}
            />
            <Toggle
              label="Evitar espacios"
              description="Avisa de espacios, también si están codificados como %20 o +."
              checked={settings.forbidSpaces}
              onChange={(value) => onChange({ forbidSpaces: value })}
            />
          </section>
        </div>
      </div>
      {errors.length > 0 && (
        <div className="notice error-notice">
          <Icon name="error" />
          <div>
            <strong>Revisa la configuración</strong>
            <p>Corrige los campos marcados antes de revisar los enlaces.</p>
          </div>
        </div>
      )}
      <p className="quiet-note">
        Los cambios se aplicarán al pulsar «Revisar enlaces». La sintaxis, los UTM duplicados y las
        credenciales en la URL se revisan siempre.
      </p>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <span className="field-help">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <div id={id} className="field-errors">
      {errors.map((error, index) => (
        <p key={index}>{error}</p>
      ))}
    </div>
  );
}
