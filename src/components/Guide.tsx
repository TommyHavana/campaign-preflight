import { Icon } from './Icon';

const PARAMS = [
  [
    'utm_source',
    '¿De dónde viene el clic?',
    'google, newsletter, instagram',
    'Identifica la fuente concreta que envía la visita.',
  ],
  [
    'utm_medium',
    '¿A través de qué canal?',
    'cpc, email, paid_social',
    'Agrupa las fuentes por tipo de tráfico. Mantén un vocabulario acordado.',
  ],
  [
    'utm_campaign',
    '¿A qué campaña pertenece?',
    'invierno_2026',
    'Conecta todas las piezas de una misma iniciativa.',
  ],
  [
    'utm_content',
    '¿Qué pieza se ha pulsado?',
    'boton_principal, video_a',
    'Distingue creatividades, variantes y posiciones de un enlace.',
  ],
  [
    'utm_term',
    '¿Qué término identificas?',
    'botas_invierno',
    'Puede identificar palabras clave u otra segmentación acordada por tu equipo.',
  ],
];
export function Guide() {
  return (
    <div className="guide-page">
      <div className="page-heading">
        <div>
          <h1>Del enlace al dato.</h1>
          <p>Una guía breve para revisar con criterio.</p>
        </div>
      </div>
      <section className="guide-intro">
        <div className="guide-symbol">
          <Icon name="link" size={32} />
        </div>
        <div>
          <h2>Un UTM es una etiqueta de contexto.</h2>
          <p>
            Estos parámetros se añaden a la URL para explicar de dónde llega una visita. Un enlace
            puede abrir correctamente y aun así llevar etiquetas incompletas o inconsistentes.
          </p>
        </div>
      </section>
      <div className="panel guide-table">
        <div className="guide-table-head">
          <span>Parámetro</span>
          <span>Qué te cuenta</span>
          <span>Ejemplo</span>
        </div>
        {PARAMS.map(([key, question, example, description]) => (
          <div className="guide-table-row" key={key}>
            <code>{key}</code>
            <div>
              <strong>{question}</strong>
              <p>{description}</p>
            </div>
            <code>{example}</code>
          </div>
        ))}
      </div>
      <div className="guide-notes">
        <section>
          <span className="status-icon error">
            <Icon name="error" />
          </span>
          <h3>Error</h3>
          <p>
            El enlace incumple una condición exigida o tiene una estructura ambigua. Corrígelo antes
            de usarlo.
          </p>
        </section>
        <section>
          <span className="status-icon warning">
            <Icon name="warning" />
          </span>
          <h3>Aviso</h3>
          <p>
            Hay una inconsistencia que merece revisión. Por ejemplo, dos formas de escribir el
            nombre de una campaña pueden dividir su medición.
          </p>
        </section>
        <section>
          <span className="status-icon pass">
            <Icon name="check" />
          </span>
          <h3>Sin hallazgos</h3>
          <p>
            El enlace pasa las reglas actuales. Esto no confirma que la página exista, cargue o
            registre visitas.
          </p>
        </section>
      </div>
      <section className="panel guide-limit">
        <Icon name="globe" />
        <div>
          <h2>Qué sabemos del destino</h2>
          <p>
            Revisamos la dirección escrita: protocolo, dominio y ruta. No abrimos páginas, seguimos
            redirecciones ni verificamos códigos HTTP. Si utilizas un acortador, introduce la URL
            final para revisar sus UTM.
          </p>
        </div>
      </section>
    </div>
  );
}
