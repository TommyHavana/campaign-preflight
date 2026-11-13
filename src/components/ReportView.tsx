import { useId, useMemo, useRef, useState } from 'react';
import { UTM_KEYS, type LinkResult, type Report, type ResultStatus } from '../domain/types';
import { Icon, type IconName } from './Icon';

const STATUS: Record<ResultStatus, { label: string; icon: IconName }> = {
  pass: { label: 'Sin hallazgos', icon: 'check' },
  warning: { label: 'Con avisos', icon: 'warning' },
  error: { label: 'Con errores', icon: 'error' },
};
const PAGE_SIZE = 50;

function normalizeSearch(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('es');
}

export function ReportView({
  report,
  stale,
  onExport,
}: {
  report: Report;
  stale: boolean;
  onExport: () => void;
}) {
  const [filter, setFilter] = useState<ResultStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const resultsId = useId();
  const resultsRef = useRef<HTMLDivElement>(null);
  const indexedResults = useMemo(
    () =>
      report.results.map((item) => ({
        item,
        searchableText: normalizeSearch(
          [
            item.original,
            item.destination ?? '',
            ...UTM_KEYS.flatMap((key) => item.utms[key] ?? []),
            ...item.findings.flatMap((finding) => [
              finding.title,
              finding.field,
              finding.code,
              finding.explanation,
              finding.suggestion,
            ]),
          ].join(' '),
        ),
      })),
    [report.results],
  );
  const normalizedQuery = normalizeSearch(query.trim());
  const results = useMemo(
    () =>
      indexedResults
        .filter(
          ({ item, searchableText }) =>
            (filter === 'all' || item.status === filter) &&
            searchableText.includes(normalizedQuery),
        )
        .map(({ item }) => item),
    [indexedResults, filter, normalizedQuery],
  );
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const visibleResults = results.slice(pageStart, pageStart + PAGE_SIZE);

  function changeFilter(nextFilter: ResultStatus | 'all') {
    setFilter(nextFilter);
    setPage(0);
    setExpanded(null);
  }

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    setPage(0);
    setExpanded(null);
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    setExpanded(null);
    requestAnimationFrame(() => {
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: 'start' });
    });
  }

  return (
    <section
      className={`report-section ${stale ? 'stale-report' : ''}`}
      aria-labelledby="report-heading"
    >
      <div className="report-heading">
        <div>
          <h2 id="report-heading" tabIndex={-1}>
            Tu informe de revisión <span className="count-badge">{report.summary.total}</span>
          </h2>
          <p>
            {stale
              ? 'Informe anterior. Revisa de nuevo para aplicar los cambios.'
              : `${report.summary.findings} hallazgos en ${report.summary.total} enlaces. Abre una fila para entender el detalle.`}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={onExport}
          disabled={stale}
          title={
            stale
              ? 'Revisa de nuevo para exportar los cambios.'
              : 'Exportar todos los enlaces, sin aplicar filtros.'
          }
        >
          <Icon name="download" size={17} />
          Exportar CSV
        </button>
      </div>
      <div className="report-summary" role="group" aria-label="Resumen de enlaces por estado">
        {(['pass', 'warning', 'error'] as const).map((status) => (
          <button
            key={status}
            className={`summary-item ${status} ${filter === status ? 'selected' : ''}`}
            onClick={() => changeFilter(filter === status ? 'all' : status)}
            aria-pressed={filter === status}
          >
            <span className={`status-icon ${status}`}>
              <Icon name={STATUS[status].icon} size={19} />
            </span>
            <span>
              <strong>{report.summary[status]}</strong> <span>{STATUS[status].label}</span>
            </span>
            <Icon name="chevron" size={15} />
          </button>
        ))}
      </div>
      <div className="panel result-panel">
        <div className="result-toolbar">
          <div className="filter-tabs" role="group" aria-label="Filtrar por estado">
            {(['all', 'error', 'warning', 'pass'] as const).map((status) => (
              <button
                key={status}
                aria-pressed={filter === status}
                onClick={() => changeFilter(status)}
                className={filter === status ? 'active' : ''}
              >
                {status === 'all'
                  ? 'Todos'
                  : status === 'error'
                    ? 'Errores'
                    : status === 'warning'
                      ? 'Avisos'
                      : 'Sin hallazgos'}{' '}
                <span>{status === 'all' ? report.summary.total : report.summary[status]}</span>
              </button>
            ))}
          </div>
          <label className="search-field">
            <Icon name="search" size={16} />
            <span className="sr-only">Buscar en el informe</span>
            <input
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Buscar enlace, UTM o hallazgo"
            />
          </label>
        </div>
        <div className="result-column-head" aria-hidden="true">
          <span>Enlace y campaña</span>
          <span>Fuente / medio</span>
          <span>Resultado</span>
          <span />
        </div>
        <div
          className="results-list"
          id={resultsId}
          ref={resultsRef}
          role="group"
          aria-label="Enlaces del informe"
          tabIndex={-1}
        >
          {visibleResults.map((item) => (
            <ResultRow
              key={item.id}
              item={item}
              expanded={expanded === item.id}
              onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            />
          ))}
        </div>
        {results.length === 0 && (
          <div className="empty-filter">
            <Icon name="search" size={28} />
            <h3>No hay enlaces con este filtro</h3>
            <p>Prueba otra búsqueda o vuelve a mostrar todos los resultados.</p>
            <button
              className="text-button"
              onClick={() => {
                changeFilter('all');
                changeQuery('');
              }}
            >
              Quitar filtros
            </button>
          </div>
        )}
        {pageCount > 1 && (
          <nav className="report-pagination" aria-label="Páginas del informe">
            <span className="pagination-count">
              Página {currentPage + 1} de {pageCount}
            </span>
            <div className="pagination-controls">
              <button
                className="button secondary"
                aria-label="Página anterior"
                aria-controls={resultsId}
                disabled={currentPage === 0}
                onClick={() => changePage(currentPage - 1)}
              >
                Anterior
              </button>
              <button
                className="button secondary"
                aria-label="Página siguiente"
                aria-controls={resultsId}
                disabled={currentPage === pageCount - 1}
                onClick={() => changePage(currentPage + 1)}
              >
                Siguiente
              </button>
            </div>
          </nav>
        )}
        <div className="report-footer">
          <span role="status" aria-live="polite" aria-atomic="true">
            {results.length === 0
              ? `0 de ${report.summary.total} ${report.summary.total === 1 ? 'enlace' : 'enlaces'}`
              : `${pageStart + 1}–${pageStart + visibleResults.length} de ${results.length} ${results.length === 1 ? 'enlace' : 'enlaces'}`}
            {results.length > 0 && results.length !== report.summary.total
              ? ` (${report.summary.total} en el informe)`
              : ''}
          </span>
          <span>El CSV incluye el informe completo.</span>
        </div>
      </div>
    </section>
  );
}

function ResultRow({
  item,
  expanded,
  onToggle,
}: {
  item: LinkResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const campaign = item.utms.utm_campaign?.join(' / ');
  const source = item.utms.utm_source?.join(' / ') || 'Sin fuente';
  const medium = item.utms.utm_medium?.join(' / ') || 'Sin medio';
  const detailId = useId();
  const destination = item.destination?.replace(/^https?:\/\//, '') || item.original;
  return (
    <article className={`result-row ${expanded ? 'expanded' : ''}`}>
      <button
        className="result-row-button"
        aria-expanded={expanded}
        aria-controls={expanded ? detailId : undefined}
        aria-label={`Línea ${item.line}. ${destination}. Campaña: ${campaign || 'Sin definir'}. Fuente: ${source}. Medio: ${medium}. ${STATUS[item.status].label}${item.findings.length ? `, ${item.findings.length} ${item.findings.length === 1 ? 'hallazgo' : 'hallazgos'}` : ''}.`}
        onClick={onToggle}
      >
        <span className="link-cell">
          <span className={`row-link-icon ${item.status}`}>
            <Icon name="link" size={17} />
          </span>
          <span>
            <strong title={item.destination || item.original}>{destination}</strong>
            <small>
              <span className="line-number">L{item.line}</span> {campaign || 'Campaña sin definir'}
            </small>
            <small className="mobile-source" aria-hidden="true">
              {source} · {medium}
            </small>
          </span>
        </span>
        <span className="source-cell">
          <span>{source}</span>
          <small>{medium}</small>
        </span>
        <span className={`status-pill ${item.status}`}>
          <Icon name={STATUS[item.status].icon} size={14} />
          {STATUS[item.status].label}
          {item.findings.length > 0 && (
            <span className="finding-count">{item.findings.length}</span>
          )}
        </span>
        <Icon name="chevron" size={16} className="row-chevron" />
      </button>
      {expanded && (
        <div className="result-detail" id={detailId}>
          <div className="detail-url">
            <span>Enlace original · línea {item.line}</span>
            <code>{item.original}</code>
          </div>
          <div className="utm-breakdown">
            {UTM_KEYS.map((key) => (
              <div key={key} className={item.utms[key]?.length ? '' : 'absent'}>
                <span>{key.replace('utm_', '')}</span>
                <code>{item.utms[key]?.map((value) => value || '(vacío)').join(' | ') || '—'}</code>
              </div>
            ))}
          </div>
          {item.findings.length > 0 ? (
            <div className="findings-list">
              {item.findings.map((finding, index) => (
                <div key={`${finding.code}-${index}`} className={`finding ${finding.severity}`}>
                  <Icon name={finding.severity === 'error' ? 'error' : 'warning'} size={18} />
                  <div>
                    <h3>
                      {finding.title}{' '}
                      <span>{finding.severity === 'error' ? 'Error' : 'Aviso'}</span>
                    </h3>
                    <p>{finding.explanation}</p>
                    <p className="suggestion">
                      <strong>Qué hacer</strong> {finding.suggestion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pass-detail">
              <Icon name="check" size={19} />
              <p>
                Este enlace cumple las reglas de esta revisión. La disponibilidad de la página no se
                ha comprobado.
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
