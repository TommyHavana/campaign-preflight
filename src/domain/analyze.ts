import {
  MAX_INPUT_LENGTH,
  MAX_LINKS,
  MAX_URL_LENGTH,
  UTM_KEYS,
  type Finding,
  type LinkResult,
  type Report,
  type RuleValidationErrors,
  type Rules,
  type UtmKey,
} from './types';

const knownUtms = new Set<string>(UTM_KEYS);
const whitespaceOrControl = /\s|[\u0000-\u001f\u007f-\u009f]/u;

function validHostname(hostname: string): boolean {
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  const name = hostname.replace(/\.$/, '');
  return (
    name.length > 0 &&
    name.length <= 253 &&
    name.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
}

/** Accept a hostname only, never a URL, path, port, wildcard or credentials. */
function normalizeDomain(domain: string): string | null {
  if (!domain || whitespaceOrControl.test(domain) || /[/\\@?#%]/.test(domain)) return null;
  if (domain.includes(':') && !/^\[[0-9a-f:]+\]$/i.test(domain)) return null;
  try {
    const url = new URL(`https://${domain}`);
    if (url.port || url.username || url.password || !validHostname(url.hostname)) return null;
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export function validateRuleFields(rules: Rules): RuleValidationErrors {
  const errors: RuleValidationErrors = {};
  const add = (field: keyof RuleValidationErrors, message: string) => {
    (errors[field] ??= []).push(message);
  };
  if (!rules || typeof rules !== 'object') {
    return { configuration: ['La configuración de reglas no es válida.'] };
  }
  if (!Array.isArray(rules.requiredUtms) || rules.requiredUtms.some((key) => !knownUtms.has(key))) {
    add(
      'requiredUtms',
      'Los UTM obligatorios deben pertenecer a los cinco parámetros UTM admitidos.',
    );
  } else if (new Set(rules.requiredUtms).size !== rules.requiredUtms.length) {
    add('requiredUtms', 'La lista de UTM obligatorios contiene parámetros repetidos.');
  }
  for (const key of [
    'requireHttps',
    'lowercaseValues',
    'forbidSpaces',
    'includeSubdomains',
  ] as const) {
    if (typeof rules[key] !== 'boolean')
      add(key, `La regla «${key}» debe estar activada o desactivada.`);
  }
  if (
    !Array.isArray(rules.allowedMediums) ||
    rules.allowedMediums.some(
      (medium) =>
        typeof medium !== 'string' || !medium.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(medium),
    )
  ) {
    add(
      'allowedMediums',
      'Los medios permitidos deben ser valores de texto no vacíos y sin caracteres de control.',
    );
  }
  if (!Array.isArray(rules.allowedDomains)) {
    add('allowedDomains', 'Los dominios permitidos deben ser una lista de nombres de host.');
  } else {
    for (const domain of rules.allowedDomains) {
      if (typeof domain !== 'string' || normalizeDomain(domain) === null) {
        add(
          'allowedDomains',
          `Dominio no válido: «${String(domain)}». Usa solo el nombre de host, por ejemplo tienda.example, sin protocolo, ruta, puerto ni comodines.`,
        );
      }
    }
  }
  if (
    typeof rules.expectedCampaign !== 'string' ||
    /[\u0000-\u001f\u007f-\u009f]/.test(rules.expectedCampaign)
  ) {
    add('expectedCampaign', 'La campaña esperada debe ser texto sin caracteres de control.');
  } else if (rules.expectedCampaign && !rules.expectedCampaign.trim()) {
    add(
      'expectedCampaign',
      'La campaña esperada no puede contener solo espacios. Escribe un nombre o deja el campo vacío para desactivar esta regla.',
    );
  }
  return errors;
}

export function validateRules(rules: Rules): string[] {
  return Object.values(validateRuleFields(rules)).flat();
}

function finish(result: LinkResult): LinkResult {
  result.status = result.findings.some((finding) => finding.severity === 'error')
    ? 'error'
    : result.findings.length > 0
      ? 'warning'
      : 'pass';
  return result;
}

function analyzeLink(
  original: string,
  line: number,
  id: number,
  rules: Rules,
  allowedDomains: string[],
  seen: Map<string, number>,
): LinkResult {
  const result: LinkResult = {
    id,
    line,
    original,
    destination: null,
    hostname: null,
    utms: {},
    status: 'pass',
    findings: [],
  };
  const add = (
    code: string,
    severity: Finding['severity'],
    field: string,
    title: string,
    explanation: string,
    suggestion: string,
  ) => {
    result.findings.push({ code, severity, field, title, explanation, suggestion });
  };

  if (whitespaceOrControl.test(original)) {
    add(
      'url_whitespace',
      'error',
      'url',
      'La URL contiene espacios o caracteres de control',
      'Los espacios sin codificar, incluso al principio o al final, hacen que el enlace pegado sea ambiguo.',
      'Elimina los espacios exteriores y codifica los espacios del enlace como %20.',
    );
  }
  if (original.includes('\\')) {
    add(
      'url_backslash',
      'error',
      'url',
      'La URL contiene barras invertidas',
      'El navegador puede interpretar una barra invertida como una barra normal y cambiar el destino.',
      'Usa / en la estructura de la URL y %5C si la barra forma parte de un valor.',
    );
  }
  if (/%(?![0-9a-f]{2})/i.test(original)) {
    add(
      'invalid_percent_encoding',
      'error',
      'url',
      'La codificación de la URL está incompleta',
      'Cada signo % debe ir seguido de dos dígitos hexadecimales.',
      'Corrige la secuencia o usa %25 para representar un signo %.',
    );
  }
  if (/[\uD800-\uDFFF]/u.test(original)) {
    add(
      'invalid_unicode',
      'error',
      'url',
      'El enlace contiene un carácter Unicode incompleto',
      'El navegador sustituiría ese carácter por � y cambiaría el enlace original.',
      'Vuelve a copiar el enlace desde su origen o regenera su codificación UTF-8.',
    );
  }
  // Stop before URL silently repairs malformed input; never analyze a different URL.
  if (result.findings.length) return finish(result);

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(original)?.[1].toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    add(
      'unsupported_protocol',
      'error',
      'url',
      'Protocolo no admitido',
      `El protocolo «${scheme}» no es un destino web HTTP o HTTPS.`,
      'Introduce una URL absoluta que empiece por https:// o http://.',
    );
    return finish(result);
  }
  let url: URL;
  try {
    if (!/^https?:\/\/[^/]/i.test(original)) throw new Error('absolute');
    url = new URL(original);
    if (!validHostname(url.hostname)) throw new Error('hostname');
  } catch {
    add(
      'invalid_url',
      'error',
      'url',
      'No es una URL web válida',
      'Se necesita una URL absoluta con protocolo HTTP o HTTPS y un nombre de host válido.',
      'Pega el enlace completo, por ejemplo https://tienda.example/oferta?utm_source=boletin.',
    );
    return finish(result);
  }

  result.destination = `${url.origin}${url.pathname}`;
  result.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.username || url.password) {
    add(
      'credentials_not_allowed',
      'error',
      'url',
      'El enlace incluye credenciales',
      'La parte anterior a @ contiene un usuario o una contraseña; no debe aparecer en un enlace de campaña.',
      `Elimina las credenciales y revisa que el destino previsto sea ${result.hostname}.`,
    );
  }
  if (rules.requireHttps && url.protocol !== 'https:') {
    add(
      'https_required',
      'error',
      'protocolo',
      'Se requiere HTTPS',
      'El enlace utiliza HTTP y las reglas de este análisis exigen HTTPS.',
      'Usa la versión HTTPS del destino y comprueba manualmente que existe.',
    );
  }
  if (
    allowedDomains.length > 0 &&
    !allowedDomains.some(
      (domain) =>
        result.hostname === domain ||
        (rules.includeSubdomains && result.hostname!.endsWith(`.${domain}`)),
    )
  ) {
    add(
      'domain_not_allowed',
      'error',
      'dominio',
      'El dominio no está permitido',
      `El host «${result.hostname}» no coincide con los dominios configurados${rules.includeSubdomains ? ' ni con sus subdominios' : ''}.`,
      'Revisa el destino o añade su nombre de host a la lista si pertenece a la campaña.',
    );
  }

  const groups = new Map<string, { keys: Set<string>; values: string[] }>();
  const invalidEncodingFields = new Set<string>();
  for (const pair of url.search.slice(1).split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    const rawKey = separator < 0 ? pair : pair.slice(0, separator);
    const rawValue = separator < 0 ? '' : pair.slice(separator + 1);
    let key: string;
    try {
      key = decodeURIComponent(rawKey.replaceAll('+', ' '));
    } catch {
      if (!invalidEncodingFields.has('consulta')) {
        add(
          'invalid_query_encoding',
          'error',
          'consulta',
          'Un nombre de parámetro no se puede leer como UTF-8',
          'La codificación de un nombre de parámetro está dañada. El navegador la sustituiría por �, por lo que no se puede identificar el parámetro de forma fiable.',
          'Regenera los nombres de los parámetros con codificación UTF-8.',
        );
        invalidEncodingFields.add('consulta');
      }
      continue;
    }
    const normalized = key.toLowerCase();
    if (!normalized.startsWith('utm_') || invalidEncodingFields.has(normalized)) continue;
    try {
      decodeURIComponent(rawValue.replaceAll('+', ' '));
    } catch {
      add(
        'invalid_utm_encoding',
        'error',
        normalized,
        'El valor UTM no se puede leer como UTF-8',
        `La codificación de «${key}» está dañada. El navegador la sustituye por �, que aparece en el desglose y podría alterar la medición. El enlace original se conserva.`,
        'Regenera este valor con codificación UTF-8; no sustituyas los caracteres dañados por el símbolo �.',
      );
      invalidEncodingFields.add(normalized);
    }
  }
  for (const [key, value] of url.searchParams) {
    const normalized = key.toLowerCase();
    if (!normalized.startsWith('utm_')) continue;
    const group = groups.get(normalized) ?? { keys: new Set<string>(), values: [] };
    group.keys.add(key);
    group.values.push(value);
    groups.set(normalized, group);
    if (knownUtms.has(normalized)) {
      const utmKey = normalized as UtmKey;
      (result.utms[utmKey] ??= []).push(value);
    }
  }
  for (const key of rules.requiredUtms) {
    if (!url.searchParams.has(key)) {
      const expectedCampaign = key === 'utm_campaign' ? rules.expectedCampaign : '';
      add(
        'missing_utm',
        'error',
        key,
        `Falta ${key}`,
        `Las reglas exigen el parámetro «${key}» escrito exactamente en minúsculas.`,
        expectedCampaign
          ? `Añade utm_campaign con el valor ${expectedCampaign}.`
          : `Añade ${key} con el valor acordado para la campaña.`,
      );
    }
  }
  if (
    rules.expectedCampaign &&
    !rules.requiredUtms.includes('utm_campaign') &&
    !url.searchParams.has('utm_campaign')
  ) {
    add(
      'campaign_mismatch',
      'error',
      'utm_campaign',
      'Falta la campaña esperada',
      `Se esperaba exactamente «${rules.expectedCampaign}» en utm_campaign, pero el parámetro no está presente con ese nombre.`,
      `Añade utm_campaign con el valor ${rules.expectedCampaign}.`,
    );
  }
  for (const [key, group] of groups) {
    const aliases = [...group.keys].filter((alias) => alias !== key);
    if (aliases.length) {
      add(
        'utm_key_case',
        'warning',
        key,
        'El nombre del parámetro usa mayúsculas',
        `«${aliases.join('», «')}» puede tratarse como un parámetro distinto de «${key}».`,
        `Escribe el nombre del parámetro como ${key}.`,
      );
    }
    if (group.values.length > 1) {
      add(
        'duplicate_utm',
        'error',
        key,
        `${key} está repetido`,
        `Hay ${group.values.length} valores para el mismo UTM, contando variantes de mayúsculas. Su interpretación puede variar entre herramientas.`,
        'Conserva un único parámetro con el valor correcto.',
      );
    }
    if (!knownUtms.has(key)) {
      add(
        'unknown_utm',
        'warning',
        key,
        'Parámetro UTM fuera del alcance de esta revisión',
        `«${key}» no pertenece a los cinco UTM revisados por esta versión. Puede ser una extensión válida o una errata.`,
        'Comprueba el nombre y confirma que tu herramienta de analítica admite este parámetro.',
      );
    }
    if (group.values.some((value) => !value.trim())) {
      add(
        'empty_utm',
        'error',
        key,
        `${key} no tiene un valor útil`,
        'El parámetro está presente, pero al menos uno de sus valores está vacío o solo contiene espacios.',
        'Asigna un valor concreto; si es opcional y no lo necesitas, elimina el parámetro.',
      );
    }
    if (rules.lowercaseValues && group.values.some((value) => value !== value.toLowerCase())) {
      add(
        'uppercase_value',
        'warning',
        key,
        'El valor contiene mayúsculas',
        'Los valores que solo se diferencian por mayúsculas pueden dividir los datos de una misma campaña.',
        'Unifica el valor en minúsculas según la nomenclatura de tu equipo.',
      );
    }
    if (rules.forbidSpaces && group.values.some((value) => whitespaceOrControl.test(value))) {
      add(
        'spaces_in_value',
        'warning',
        key,
        'El valor contiene espacios',
        'Se han detectado espacios o caracteres de control en el valor decodificado, incluidos + o %20.',
        'Usa una nomenclatura consistente, por ejemplo lanzamiento_otono.',
      );
    }
    if (
      key === 'utm_medium' &&
      rules.allowedMediums.length > 0 &&
      group.values.some((value) => !rules.allowedMediums.includes(value))
    ) {
      add(
        'medium_not_allowed',
        'error',
        key,
        'El medio no está permitido',
        `El valor no coincide exactamente con ninguno de los medios permitidos: ${rules.allowedMediums.join(', ')}.`,
        'Usa uno de los medios configurados o actualiza la lista si has acordado un medio nuevo.',
      );
    }
    if (
      key === 'utm_campaign' &&
      rules.expectedCampaign &&
      url.searchParams.has('utm_campaign') &&
      group.values.some((value) => value !== rules.expectedCampaign)
    ) {
      add(
        'campaign_mismatch',
        'error',
        key,
        'La campaña no coincide',
        `Se esperaba exactamente «${rules.expectedCampaign}» en utm_campaign.`,
        'Corrige el identificador de campaña o revisa la campaña esperada en las reglas.',
      );
    }
  }

  // URLSearchParams decodes names while preserving encoded separators inside values.
  const fragment = url.hash.slice(1);
  const fragmentQueries = [fragment];
  const questionMark = fragment.indexOf('?');
  const prefix = fragment.slice(0, questionMark);
  // A '?' inside an existing parameter value is data, not a hash-route separator.
  if (questionMark >= 0 && (!/[=&]/.test(prefix) || /^[!/]/.test(prefix))) {
    fragmentQueries.push(fragment.slice(questionMark + 1));
  }
  const fragmentContainsUtm = fragmentQueries.some((query) =>
    [...new URLSearchParams(query).keys()].some((key) => key.toLowerCase().startsWith('utm_')),
  );
  if (fragmentContainsUtm) {
    add(
      'fragment_utm',
      'warning',
      'fragmento',
      'Hay UTM después de #',
      'Estos parámetros están en el fragmento del enlace y no en su consulta. Su lectura depende de la herramienta y no cuentan como UTM de esta revisión.',
      'Mueve los UTM a la consulta, después de ? y antes de #.',
    );
  }
  const canonical = new URL(url.href);
  canonical.searchParams.sort();
  const firstLine = seen.get(canonical.href);
  if (firstLine !== undefined) {
    add(
      'duplicate_link',
      'warning',
      'url',
      'El enlace ya aparece en el lote',
      `Coincide con el enlace de la línea ${firstLine}, ignorando el orden entre nombres de parámetros.`,
      'Comprueba si la repetición es intencionada antes de distribuir el lote.',
    );
  } else {
    seen.set(canonical.href, line);
  }
  return finish(result);
}

export function analyzeLinks(input: string, rules: Rules): Report {
  const ruleErrors = validateRules(rules);
  if (ruleErrors.length) throw new Error(ruleErrors.join('\n'));
  if (input.length > MAX_INPUT_LENGTH) {
    throw new Error(
      `El texto supera el límite de ${MAX_INPUT_LENGTH.toLocaleString('es-ES')} caracteres. Divide el lote antes de analizarlo.`,
    );
  }
  const entries = input
    .split(/\r\n|\n|\r/)
    .map((original, index) => ({ original, line: index + 1 }))
    .filter(({ original }) => original.trim().length > 0);
  if (entries.length > MAX_LINKS) {
    throw new Error(
      `El lote supera el límite de ${MAX_LINKS} enlaces. Divide el lote antes de analizarlo.`,
    );
  }
  const oversized = entries.find(({ original }) => original.length > MAX_URL_LENGTH);
  if (oversized) {
    throw new Error(
      `El enlace de la línea ${oversized.line} supera el límite de ${MAX_URL_LENGTH.toLocaleString('es-ES')} caracteres. No se ha analizado el lote.`,
    );
  }
  const snapshot: Rules = {
    ...rules,
    requiredUtms: [...rules.requiredUtms],
    allowedDomains: [...rules.allowedDomains],
    allowedMediums: [...rules.allowedMediums],
  };
  const allowedDomains = snapshot.allowedDomains.map((domain) => normalizeDomain(domain)!);
  const seen = new Map<string, number>();
  const results = entries.map(({ original, line }, index) =>
    analyzeLink(original, line, index + 1, snapshot, allowedDomains, seen),
  );
  return {
    results,
    rules: snapshot,
    summary: {
      total: results.length,
      pass: results.filter((result) => result.status === 'pass').length,
      warning: results.filter((result) => result.status === 'warning').length,
      error: results.filter((result) => result.status === 'error').length,
      findings: results.reduce((total, result) => total + result.findings.length, 0),
    },
  };
}
