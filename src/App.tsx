import { useMemo, useRef, useState } from 'react';
import { analyzeLinks, validateRuleFields } from './domain/analyze';
import { exportReportCsv } from './domain/csv';
import { MAX_INPUT_LENGTH, MAX_LINKS, type Report } from './domain/types';
import { INVALID_EXAMPLES, MIXED_EXAMPLES, VALID_EXAMPLES } from './data/examples';
import { Icon, type IconName } from './components/Icon';
import {
  INITIAL_SETTINGS,
  settingsToRules,
  ruleSignature,
  type RuleSettings,
} from './state/settings';
import { RulesEditor } from './components/RulesEditor';
import { ReportView } from './components/ReportView';
import { Guide } from './components/Guide';

type Page = 'review' | 'rules' | 'guide';
const NAV: { id: Page; label: string; icon: IconName }[] = [
  { id: 'review', label: 'Revisión', icon: 'scan' },
  { id: 'rules', label: 'Reglas', icon: 'sliders' },
  { id: 'guide', label: 'Guía UTM', icon: 'book' },
];
interface AnalysisSnapshot {
  report: Report;
  input: string;
  rulesSignature: string;
  version: number;
}

interface UndoSnapshot {
  input: string;
  settings: RuleSettings;
  analysis: AnalysisSnapshot | null;
  message: string;
  page: Page;
}

export default function App() {
  const [page, setPage] = useState<Page>('review');
  const [input, setInput] = useState(MIXED_EXAMPLES);
  const [settings, setSettings] = useState<RuleSettings>(() => ({
    ...INITIAL_SETTINGS,
    requiredUtms: [...INITIAL_SETTINGS.requiredUtms],
  }));
  const [analysis, setAnalysis] = useState<AnalysisSnapshot | null>(() => {
    const rules = settingsToRules(INITIAL_SETTINGS);
    return {
      report: analyzeLinks(MIXED_EXAMPLES, rules),
      input: MIXED_EXAMPLES,
      rulesSignature: ruleSignature(rules),
      version: 0,
    };
  });
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextVersion = useRef(0);
  const rules = useMemo(() => settingsToRules(settings), [settings]);
  const fieldErrors = useMemo(() => validateRuleFields(rules), [rules]);
  const ruleErrors = Object.values(fieldErrors).flat();
  const lineCount = useMemo(
    () => input.split(/\r\n|\n|\r/).filter((line) => line.trim()).length,
    [input],
  );
  const signature = useMemo(() => ruleSignature(rules), [rules]);
  const report = analysis?.report ?? null;
  const stale =
    analysis !== null && (analysis.input !== input || analysis.rulesSignature !== signature);
  const inputProblem =
    lineCount > MAX_LINKS
      ? `El lote supera los ${MAX_LINKS} enlaces. Divídelo antes de revisar; no se ha recortado la entrada.`
      : input.length > MAX_INPUT_LENGTH
        ? 'El texto supera 1.000.000 de caracteres. Divide el lote; no se ha recortado la entrada.'
        : error;
  const isExample = [MIXED_EXAMPLES, VALID_EXAMPLES, INVALID_EXAMPLES].includes(input);
  const activeChecks =
    rules.requiredUtms.length +
    Number(rules.requireHttps) +
    Number(rules.lowercaseValues) +
    Number(rules.forbidSpaces) +
    Number(rules.allowedMediums.length > 0) +
    Number(rules.allowedDomains.length > 0) +
    Number(Boolean(rules.expectedCampaign));

  function navigate(nextPage: Page) {
    setPage(nextPage);
    requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    });
  }

  function review() {
    try {
      const next = analyzeLinks(input, rules);
      setAnalysis({
        report: next,
        input,
        rulesSignature: signature,
        version: ++nextVersion.current,
      });
      setError('');
      setAnnouncement(
        `Revisión terminada: ${next.summary.total} enlaces; ${next.summary.error} con errores, ${next.summary.warning} con avisos y ${next.summary.pass} sin hallazgos.`,
      );
      requestAnimationFrame(() => {
        const heading = document.getElementById('report-heading');
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: 'start' });
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo revisar el lote. Comprueba los enlaces y las reglas.',
      );
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function checkpoint(message: string) {
    setUndo({ input, settings, analysis, message, page });
  }

  function undoReplacement() {
    if (!undo) return;
    setInput(undo.input);
    setSettings(undo.settings);
    setAnalysis(undo.analysis);
    setError('');
    navigate(undo.page);
    setUndo(null);
    setAnnouncement('Se ha recuperado el trabajo anterior.');
  }

  function changeSettings(patch: Partial<RuleSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setUndo(null);
    setError('');
  }

  function loadExample(value: string) {
    if (input === value) return;
    checkpoint('Ejemplo cargado. Puedes recuperar el lote anterior.');
    setInput(value);
    setError('');
    setAnnouncement('Ejemplo cargado. Pulsa Revisar enlaces para aplicar tus reglas.');
  }

  function startNew() {
    checkpoint('Nueva revisión iniciada. Puedes recuperar el trabajo anterior.');
    navigate('review');
    setInput('');
    setAnalysis(null);
    setError('');
    setAnnouncement('Revisión vacía. Pega tus enlaces para empezar.');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function downloadCsv() {
    if (!report || stale) return;
    const blob = new Blob([exportReportCsv(report)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `campaign-preflight-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement(`CSV generado con los ${report.summary.total} enlaces del informe.`);
  }

  return (
    <div className={`app-shell${undo ? ' has-undo' : ''}`}>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          aria-label="Campaign Preflight, revisión"
          onClick={(event) => {
            event.preventDefault();
            navigate('review');
          }}
        >
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                d="m7 17 6 6L26 9M18 9h8v8"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            campaign<span>preflight</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">CP</span>
          <span>
            Mi espacio de trabajo<small>Proyecto local</small>
          </span>
        </div>
        <nav aria-label="Navegación principal">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
              {item.id === 'rules' && <span className="nav-count">{activeChecks}</span>}
              {item.id === 'review' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-spark">↗</span>
          <h2>Un buen lanzamiento empieza en el enlace.</h2>
          <p>Cuida las etiquetas hoy. Entiende tus resultados mañana.</p>
          <button onClick={() => navigate('guide')}>
            Conoce los UTM <Icon name="arrow" size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="local-indicator" />
          <div>
            Solo en tu navegador<small>Tus enlaces se quedan aquí.</small>
          </div>
          <Icon name="lock" size={15} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Espacio de trabajo <Icon name="chevron" size={12} />
            <strong>{NAV.find((item) => item.id === page)?.label}</strong>
          </div>
          <span className="version-tag">
            Versión local <span>0.1</span>
          </span>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {page === 'review' && (
            <>
              <div className="page-heading review-heading">
                <div>
                  <div className="heading-kicker">
                    <span />
                    Antes del lanzamiento
                  </div>
                  <h1>Revisa antes de lanzar.</h1>
                  <p>Cada enlace cuenta. Asegúrate de que también mida bien.</p>
                </div>
                <button className="button secondary new-review" onClick={startNew}>
                  <Icon name="plus" size={17} />
                  Nueva revisión
                </button>
              </div>
              <div className="input-grid">
                <section className="panel input-panel" aria-labelledby="input-heading">
                  <div className="panel-heading">
                    <div>
                      <span className="step-number">1</span>
                      <h2 id="input-heading">Añade tus enlaces</h2>
                    </div>
                    {isExample && <span className="example-tag">Ejemplo ficticio</span>}
                  </div>
                  <div className="input-instructions">
                    <label htmlFor="campaign-urls">Una URL completa por línea</label>
                    <span className={lineCount > MAX_LINKS ? 'limit-exceeded' : ''}>
                      {lineCount} / {MAX_LINKS} enlaces
                    </span>
                  </div>
                  <textarea
                    id="campaign-urls"
                    ref={inputRef}
                    className="url-input"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value);
                      setError('');
                      setUndo(null);
                    }}
                    placeholder={
                      'https://tu-marca.example/oferta?utm_source=google&utm_medium=cpc&utm_campaign=invierno_2026'
                    }
                    aria-invalid={Boolean(inputProblem)}
                    aria-describedby={`url-help url-privacy${inputProblem ? ' url-error' : ''}`}
                  />
                  {inputProblem && (
                    <div id="url-error" className="field-errors" role="alert">
                      {inputProblem}
                    </div>
                  )}
                  <div className="input-bottom">
                    <div className="example-actions">
                      <span>Prueba con</span>
                      <button onClick={() => loadExample(MIXED_EXAMPLES)}>un lote mixto</button>
                      <button onClick={() => loadExample(VALID_EXAMPLES)}>correctos</button>
                      <button onClick={() => loadExample(INVALID_EXAMPLES)}>con problemas</button>
                    </div>
                    <button
                      className="text-button clear-button"
                      disabled={!input}
                      onClick={() => {
                        checkpoint('Entrada vaciada. Puedes recuperar tus enlaces.');
                        setInput('');
                        setError('');
                      }}
                    >
                      Vaciar
                    </button>
                  </div>
                  <div className="input-submit">
                    <p id="url-help">
                      <Icon name="lock" size={14} />
                      Análisis local. No visitamos los destinos.
                    </p>
                    <button
                      className="button primary"
                      onClick={review}
                      disabled={
                        lineCount === 0 ||
                        lineCount > MAX_LINKS ||
                        input.length > MAX_INPUT_LENGTH ||
                        ruleErrors.length > 0
                      }
                    >
                      <Icon name="scan" size={17} />
                      Revisar enlaces
                      <Icon name="arrow" size={17} />
                    </button>
                  </div>
                  <p id="url-privacy" className="privacy-note">
                    Esta pestaña no guarda tus cambios al recargar.
                  </p>
                </section>
                <section className="panel rules-overview" aria-labelledby="rules-heading">
                  <div className="panel-heading">
                    <div>
                      <span className="step-number">2</span>
                      <h2 id="rules-heading">Reglas de revisión</h2>
                    </div>
                    <Icon name="sliders" size={17} />
                  </div>
                  <p>Tu criterio de calidad, aplicado a cada enlace.</p>
                  <ul className="rules-preview">
                    <li>
                      <Icon name="check" size={15} />
                      <span>
                        {rules.requiredUtms.length
                          ? `${rules.requiredUtms.length} UTM obligatorios`
                          : 'Sin UTM obligatorios'}
                        <small>
                          {rules.requiredUtms.map((key) => key.replace('utm_', '')).join(', ') ||
                            'Puedes elegirlos en Reglas'}
                        </small>
                      </span>
                    </li>
                    <li>
                      <Icon name={rules.requireHttps ? 'check' : 'close'} size={15} />
                      <span>
                        {rules.requireHttps ? 'Destinos con HTTPS' : 'HTTP y HTTPS permitidos'}
                      </span>
                    </li>
                    <li>
                      <Icon
                        name={rules.lowercaseValues || rules.forbidSpaces ? 'check' : 'close'}
                        size={15}
                      />
                      <span>
                        {[
                          rules.lowercaseValues && 'Minúsculas',
                          rules.forbidSpaces && 'sin espacios',
                        ]
                          .filter(Boolean)
                          .join(' y ') || 'Formato UTM libre'}
                      </span>
                    </li>
                    <li>
                      <Icon name="check" size={15} />
                      <span>
                        {rules.allowedMediums.length
                          ? `${rules.allowedMediums.length} medios permitidos`
                          : 'Cualquier medio permitido'}
                      </span>
                    </li>
                    <li>
                      <Icon name="globe" size={15} />
                      <span>
                        {rules.allowedDomains.length
                          ? `${rules.allowedDomains.length} ${rules.allowedDomains.length === 1 ? 'dominio autorizado' : 'dominios autorizados'}`
                          : 'Cualquier dominio'}
                        <small>
                          {rules.expectedCampaign
                            ? `Campaña: ${rules.expectedCampaign}`
                            : 'Sin nombre de campaña fijado'}
                        </small>
                      </span>
                    </li>
                  </ul>
                  <button className="button rules-button" onClick={() => navigate('rules')}>
                    Ajustar reglas
                    <Icon name="arrow" size={16} />
                  </button>
                </section>
              </div>
              {ruleErrors.length > 0 && (
                <div className="notice error-notice" role="alert">
                  <Icon name="error" />
                  <div>
                    <strong>Hay reglas que necesitan un ajuste.</strong>
                    <p>{ruleErrors.join(' ')}</p>
                    <button className="text-button" onClick={() => navigate('rules')}>
                      Abrir reglas
                    </button>
                  </div>
                </div>
              )}
              {stale && (
                <div className="notice stale-notice" role="status">
                  <Icon name="refresh" size={18} />
                  <span>
                    Hay cambios pendientes. Pulsa <strong>Revisar enlaces</strong> para actualizar
                    el informe y exportarlo.
                  </span>
                </div>
              )}
              {report ? (
                <ReportView
                  key={analysis?.version}
                  report={report}
                  stale={stale}
                  onExport={downloadCsv}
                />
              ) : (
                <section className="empty-report">
                  <div className="empty-report-icon">
                    <Icon name="scan" size={30} />
                  </div>
                  <h2>El siguiente paso es una buena revisión.</h2>
                  <p>
                    Pega los enlaces de tu campaña o carga un ejemplo.
                    <br />
                    Aquí verás qué corregir y por qué.
                  </p>
                </section>
              )}
              <footer className="workspace-footer">
                <Icon name="globe" size={15} />
                <span>
                  Revisamos la URL y sus etiquetas. La disponibilidad de la página queda fuera de
                  esta versión.
                </span>
              </footer>
            </>
          )}
          {page === 'rules' && (
            <>
              <RulesEditor
                settings={settings}
                fieldErrors={fieldErrors}
                onChange={changeSettings}
                onReset={() => {
                  checkpoint('Reglas restablecidas. Puedes recuperar la configuración anterior.');
                  setSettings({
                    ...INITIAL_SETTINGS,
                    requiredUtms: [...INITIAL_SETTINGS.requiredUtms],
                  });
                  setAnnouncement('Reglas predeterminadas restauradas.');
                }}
              />
              <div className="rules-return">
                <span>{stale ? 'Cambios pendientes de revisión.' : 'Configuración lista.'}</span>
                <button className="button primary" onClick={() => navigate('review')}>
                  Volver a la revisión
                  <Icon name="arrow" size={17} />
                </button>
              </div>
            </>
          )}
          {page === 'guide' && <Guide />}
        </main>
      </div>
      {undo && (
        <div className="undo-notice" role="status">
          <Icon name="refresh" size={18} />
          <p>{undo.message}</p>
          <button className="button secondary" onClick={undoReplacement}>
            Deshacer
          </button>
          <button
            className="undo-dismiss"
            aria-label="Descartar opción de deshacer"
            onClick={() => setUndo(null)}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
