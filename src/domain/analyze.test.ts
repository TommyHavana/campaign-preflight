import { describe, expect, it } from 'vitest';
import { analyzeLinks, validateRuleFields, validateRules } from './analyze';
import { DEFAULT_RULES, MAX_INPUT_LENGTH, MAX_LINKS, MAX_URL_LENGTH, type Rules } from './types';

function rules(overrides: Partial<Rules> = {}): Rules {
  return {
    ...DEFAULT_RULES,
    requiredUtms: [...DEFAULT_RULES.requiredUtms],
    allowedMediums: [...DEFAULT_RULES.allowedMediums],
    allowedDomains: [...DEFAULT_RULES.allowedDomains],
    ...overrides,
  };
}

const goodLink =
  'https://tienda.example/lanzamiento?utm_source=google&utm_medium=cpc&utm_campaign=invierno_2026';

function inspect(input: string, overrides: Partial<Rules> = {}) {
  return analyzeLinks(input, rules(overrides)).results[0]!;
}

function codes(input: string, overrides: Partial<Rules> = {}) {
  return inspect(input, overrides).findings.map((finding) => finding.code);
}

describe('campaign link analysis', () => {
  it('accepts a complete, correctly named campaign and retains its UTM values', () => {
    const result = inspect(goodLink);
    expect(result.status).toBe('pass');
    expect(result.findings).toEqual([]);
    expect(result.hostname).toBe('tienda.example');
    expect(result.utms).toMatchObject({
      utm_source: ['google'],
      utm_medium: ['cpc'],
      utm_campaign: ['invierno_2026'],
    });
  });

  it('reports each missing required UTM with an explanation and actionable suggestion', () => {
    const result = inspect('https://tienda.example/lanzamiento');
    const missing = result.findings.filter((finding) => finding.code === 'missing_utm');
    expect(missing.map((finding) => finding.field).sort()).toEqual([
      'utm_campaign',
      'utm_medium',
      'utm_source',
    ]);
    expect(result.status).toBe('error');
    for (const finding of missing) {
      expect(finding.severity).toBe('error');
      expect(finding.explanation.trim().length).toBeGreaterThan(0);
      expect(finding.suggestion.trim().length).toBeGreaterThan(0);
    }
  });

  it('allows the user to choose the required UTM fields', () => {
    expect(
      inspect('https://tienda.example/?utm_source=boletin', {
        requiredUtms: ['utm_source'],
      }).status,
    ).toBe('pass');
    expect(inspect('https://tienda.example/', { requiredUtms: [] }).status).toBe('pass');
  });

  it.each(['', '%20', '+'])(
    'distinguishes empty or blank values (%s) from missing keys',
    (value) => {
      const result = inspect(goodLink.replace('utm_source=google', `utm_source=${value}`));
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'empty_utm', field: 'utm_source', severity: 'error' }),
        ]),
      );
    },
  );

  it.each(['/lanzamiento', 'no-es-un-enlace', 'https://'])(
    'rejects non-absolute or invalid input: %s',
    (input) => {
      expect(codes(input)).toContain('invalid_url');
      expect(inspect(input).status).toBe('error');
    },
  );

  it.each(['javascript:alert(1)', 'ftp://tienda.example/campana', 'data:text/html,hola'])(
    'rejects a non-web scheme: %s',
    (input) => {
      expect(codes(input)).toContain('unsupported_protocol');
    },
  );

  it('flags raw spaces and backslashes that URL parsers would otherwise normalize', () => {
    expect(codes(goodLink.replace('google', 'goo gle'))).toContain('url_whitespace');
    expect(codes(goodLink.replace('/lanzamiento', '\\lanzamiento'))).toContain('url_backslash');
  });

  it('rejects malformed percent escapes without rejecting correctly encoded characters', () => {
    expect(codes(goodLink.replace('google', 'goo%ZZgle'))).toContain('invalid_percent_encoding');
    expect(inspect(goodLink.replace('google', 'bolet%C3%ADn')).status).toBe('pass');
  });

  it.each(['%FF', '%E0%A4', '%C0%AF', '%ED%A0%80', '%F4%90%80%80'])(
    'does not approve a UTM value that decoding would silently corrupt: %s',
    (encoded) => {
      const link = goodLink.replace('google', encoded);
      const result = inspect(link);
      expect(result.status).toBe('error');
      expect(result.original).toBe(link);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid_utm_encoding',
            field: 'utm_source',
            severity: 'error',
          }),
        ]),
      );
    },
  );

  it('flags damaged query keys but does not impose UTF-8 on unexamined legacy values or paths', () => {
    expect(codes(`${goodLink}&utm_sour%FFce=google`)).toContain('invalid_query_encoding');
    expect(inspect(`${goodLink}&legacy=%FF`).status).toBe('pass');
    expect(inspect(goodLink.replace('/lanzamiento', '/%FF')).status).toBe('pass');
  });

  it('accepts valid supplementary Unicode and encoded literal percent signs', () => {
    const result = inspect(goodLink.replace('google', 'boletin_%F0%9F%8C%B1_%25'));
    expect(result.status).toBe('pass');
    expect(result.utms.utm_source).toEqual(['boletin_🌱_%']);
    expect(inspect(goodLink.replace('google', 'boletin_🌱')).status).toBe('pass');
  });

  it('rejects isolated Unicode surrogates before URL silently replaces them', () => {
    expect(codes(goodLink.replace('google', '\uD800'))).toContain('invalid_unicode');
    expect(codes(goodLink.replace('google', '\uDC00'))).toContain('invalid_unicode');
  });

  it('makes HTTPS enforcement configurable', () => {
    const insecure = goodLink.replace('https:', 'http:');
    expect(codes(insecure)).toContain('https_required');
    expect(inspect(insecure, { requireHttps: false }).status).toBe('pass');
  });

  it('flags uppercase UTM values as a convention warning that can be disabled', () => {
    const uppercase = goodLink.replace('utm_source=google', 'utm_source=Google');
    expect(inspect(uppercase).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'uppercase_value',
          severity: 'warning',
          field: 'utm_source',
        }),
      ]),
    );
    expect(inspect(uppercase).status).toBe('warning');
    expect(inspect(uppercase, { lowercaseValues: false }).status).toBe('pass');
  });

  it.each(['invierno%202026', 'invierno+2026'])(
    'detects decoded spaces in %s and respects the toggle',
    (campaign) => {
      const spaced = goodLink.replace('invierno_2026', campaign);
      expect(codes(spaced)).toContain('spaces_in_value');
      expect(inspect(spaced, { forbidSpaces: false }).status).toBe('pass');
    },
  );

  it.each(['utm_source=otro', 'UTM_SOURCE=otro'])(
    'rejects duplicate UTM keys including casing variants: %s',
    (extra) => {
      expect(codes(`${goodLink}&${extra}`)).toContain('duplicate_utm');
    },
  );

  it('preserves duplicate UTM values for diagnosis but permits repeated non-UTM parameters', () => {
    expect(inspect(`${goodLink}&utm_source=bing`).utms.utm_source).toEqual(['google', 'bing']);
    expect(inspect(`${goodLink}&tag=abrigo&tag=invierno`).status).toBe('pass');
  });

  it('does not silently treat an uppercase UTM key as the required lowercase key', () => {
    const found = codes(goodLink.replace('utm_source=', 'UTM_SOURCE='));
    expect(found).toContain('utm_key_case');
    expect(found).toContain('missing_utm');
  });

  it('explains that UTMs placed after # do not satisfy query requirements', () => {
    const found = codes(
      'https://tienda.example/#utm_source=google&utm_medium=cpc&utm_campaign=invierno_2026',
    );
    expect(found).toContain('fragment_utm');
    expect(found).toContain('missing_utm');
    expect(inspect(`${goodLink}#detalles`).status).toBe('pass');
  });

  it.each(['#%75tm_source=google', '#/oferta?utm_source=google'])(
    'detects UTM keys encoded or placed in hash routes: %s',
    (fragment) => {
      expect(codes(`${goodLink}${fragment}`)).toContain('fragment_utm');
    },
  );

  it('does not mistake UTM-like text inside a fragment value for a query key', () => {
    expect(inspect(`${goodLink}#nota=utm_source%3Dgoogle`).status).toBe('pass');
    expect(inspect(`${goodLink}#nota=valor?utm_source=google`).status).toBe('pass');
  });

  it('detects UTM fragment keys when their values contain a literal question mark', () => {
    expect(codes(`${goodLink}#utm_source=google?otra=etiqueta`)).toContain('fragment_utm');
  });

  it('warns about a likely misspelling of a UTM key', () => {
    expect(codes(`${goodLink}&utm_sorce=google`)).toContain('unknown_utm');
  });

  it('enforces an exact campaign name only when one is configured', () => {
    expect(inspect(goodLink, { expectedCampaign: 'invierno_2026' }).status).toBe('pass');
    expect(codes(goodLink, { expectedCampaign: 'verano_2026' })).toContain('campaign_mismatch');
    expect(inspect(goodLink, { expectedCampaign: '' }).status).toBe('pass');
  });

  it('requires the expected campaign even when utm_campaign is not in the required fields', () => {
    const result = inspect('https://tienda.example/?utm_source=google', {
      requiredUtms: ['utm_source'],
      expectedCampaign: 'invierno_2026',
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'campaign_mismatch',
          severity: 'error',
          field: 'utm_campaign',
        }),
      ]),
    );
    expect(result.findings.some((finding) => finding.code === 'missing_utm')).toBe(false);
  });

  it('explains a missing required campaign once and includes the expected value in its fix', () => {
    const result = inspect(goodLink.replace('&utm_campaign=invierno_2026', ''), {
      expectedCampaign: 'invierno_2026',
    });
    const campaignFindings = result.findings.filter((finding) => finding.field === 'utm_campaign');
    expect(campaignFindings).toHaveLength(1);
    expect(campaignFindings[0]?.code).toBe('missing_utm');
    expect(campaignFindings[0]?.suggestion).toContain('invierno_2026');
  });

  it('enforces the medium allowlist and permits disabling it with an empty list', () => {
    const customMedium = goodLink.replace('utm_medium=cpc', 'utm_medium=podcast');
    expect(codes(customMedium)).toContain('medium_not_allowed');
    expect(inspect(customMedium, { allowedMediums: ['podcast'] }).status).toBe('pass');
    expect(inspect(customMedium, { allowedMediums: [] }).status).toBe('pass');
  });

  it('allows only the exact domain by default and subdomains when explicitly enabled', () => {
    const domainRules = { allowedDomains: ['tienda.example'] };
    expect(inspect(goodLink, domainRules).status).toBe('pass');
    const subdomain = goodLink.replace('tienda.example', 'shop.tienda.example');
    expect(codes(subdomain, domainRules)).toContain('domain_not_allowed');
    expect(inspect(subdomain, { ...domainRules, includeSubdomains: true }).status).toBe('pass');
  });

  it.each(['falsatienda.example', 'tienda.example.evil.test'])(
    'does not confuse a hostile suffix with a subdomain: %s',
    (hostname) => {
      expect(
        codes(goodLink.replace('tienda.example', hostname), {
          allowedDomains: ['tienda.example'],
          includeSubdomains: true,
        }),
      ).toContain('domain_not_allowed');
    },
  );

  it('compares normalized international hostnames and trailing DNS dots consistently', () => {
    const idnLink = goodLink.replace('tienda.example', 'xn--caf-dma.example');
    expect(inspect(idnLink, { allowedDomains: ['CAFÉ.example.'] }).status).toBe('pass');
    expect(
      inspect(goodLink.replace('tienda.example', 'tienda.example.'), {
        allowedDomains: ['TIENDA.EXAMPLE'],
      }).status,
    ).toBe('pass');
    expect(
      codes(goodLink.replace('tienda.example', 'tienda.example.evil.test.'), {
        allowedDomains: ['tienda.example'],
        includeSubdomains: true,
      }),
    ).toContain('domain_not_allowed');
  });

  it('rejects credentials and checks the real hostname, not the userinfo text', () => {
    const misleading = goodLink.replace('tienda.example', 'tienda.example@evil.test');
    expect(codes(misleading, { allowedDomains: ['tienda.example'] })).toEqual(
      expect.arrayContaining(['credentials_not_allowed', 'domain_not_allowed']),
    );
    expect(codes(goodLink.replace('tienda.example', 'usuario:secreto@tienda.example'))).toContain(
      'credentials_not_allowed',
    );
  });

  it('preserves original line numbers through blank lines and CRLF input', () => {
    const report = analyzeLinks(
      `\r\n${goodLink}\r\n  \r\n${goodLink.replace('google', 'bing')}\r\n`,
      rules(),
    );
    expect(report.results.map((result) => result.line)).toEqual([2, 4]);
    expect(report.summary.total).toBe(2);
    expect(report.summary.pass).toBe(2);
  });

  it('warns about repeated input links without removing either result', () => {
    const report = analyzeLinks(`${goodLink}\n${goodLink}`, rules());
    expect(report.results).toHaveLength(2);
    expect(report.results[1]!.findings.some((finding) => finding.code === 'duplicate_link')).toBe(
      true,
    );
  });

  it('normalizes query name order for duplicates without changing repeated-value order', () => {
    const reordered =
      'https://tienda.example/lanzamiento?utm_campaign=invierno_2026&utm_medium=cpc&utm_source=google';
    const report = analyzeLinks(`${goodLink}\n${reordered}`, rules());
    expect(report.results[1]?.findings.some((finding) => finding.code === 'duplicate_link')).toBe(
      true,
    );
    const orderedTags = analyzeLinks(`${goodLink}&tag=a&tag=b\n${goodLink}&tag=b&tag=a`, rules());
    expect(orderedTags.results.every((result) => result.status === 'pass')).toBe(true);
  });

  it('sums statuses by their highest severity and counts all findings', () => {
    const report = analyzeLinks(
      [
        goodLink,
        goodLink.replace('google', 'Google'),
        'http://tienda.example/?utm_source=Google',
      ].join('\n'),
      rules(),
    );
    expect(report.summary).toMatchObject({ total: 3, pass: 1, warning: 1, error: 1 });
    expect(report.summary.findings).toBe(
      report.results.reduce((total, result) => total + result.findings.length, 0),
    );
  });

  it('produces a useful empty report for whitespace input', () => {
    const report = analyzeLinks(' \n\r\n\t ', rules());
    expect(report.results).toEqual([]);
    expect(report.summary).toEqual({ total: 0, pass: 0, warning: 0, error: 0, findings: 0 });
  });

  it('keeps a rules snapshot independent of subsequent editor changes', () => {
    const editableRules = rules({ allowedDomains: ['tienda.example'] });
    const report = analyzeLinks(goodLink, editableRules);
    editableRules.requireHttps = false;
    editableRules.requiredUtms.pop();
    editableRules.allowedMediums.push('podcast');
    editableRules.allowedDomains.push('evil.test');
    expect(report.rules.requireHttps).toBe(true);
    expect(report.rules.requiredUtms).toEqual(DEFAULT_RULES.requiredUtms);
    expect(report.rules.allowedMediums).not.toContain('podcast');
    expect(report.rules.allowedDomains).toEqual(['tienda.example']);
  });
});

describe('input and rule boundaries', () => {
  it('accepts the maximum link count and rejects overflow without silently dropping links', () => {
    expect(analyzeLinks(Array(MAX_LINKS).fill(goodLink).join('\n'), rules()).results).toHaveLength(
      MAX_LINKS,
    );
    expect(() =>
      analyzeLinks(
        Array(MAX_LINKS + 1)
          .fill(goodLink)
          .join('\n'),
        rules(),
      ),
    ).toThrow();
  });

  it('rejects an excessively long URL and total input', () => {
    expect(() =>
      analyzeLinks(`${goodLink}&extra=${'a'.repeat(MAX_URL_LENGTH)}`, rules()),
    ).toThrow();
    expect(() => analyzeLinks(' '.repeat(MAX_INPUT_LENGTH + 1), rules())).toThrow();
  });

  it('validates an empty domain allowlist and ordinary hostname entries', () => {
    expect(validateRules(rules())).toEqual([]);
    expect(
      validateRules(rules({ allowedDomains: ['tienda.example', 'shop.example.com'] })),
    ).toEqual([]);
  });

  it('associates each configuration error with its field and preserves the flat validation API', () => {
    const configuration = rules({
      allowedDomains: ['https://tienda.example', '*.tienda.example'],
      allowedMediums: [''],
      expectedCampaign: 'invierno\u0000',
    });
    const fields = validateRuleFields(configuration);
    expect(fields.allowedDomains).toHaveLength(2);
    expect(fields.allowedMediums).toHaveLength(1);
    expect(fields.expectedCampaign).toHaveLength(1);
    expect(fields.requiredUtms).toBeUndefined();
    expect(validateRules(configuration)).toEqual(Object.values(fields).flat());
    expect(validateRuleFields(rules())).toEqual({});
  });

  it('rejects a whitespace-only expected campaign while allowing empty or useful exact labels', () => {
    for (const expectedCampaign of ['   ', '\u00A0\u2003']) {
      const configuration = rules({ expectedCampaign });
      expect(validateRuleFields(configuration).expectedCampaign).toHaveLength(1);
      expect(() => analyzeLinks(goodLink, configuration)).toThrow(/solo espacios/);
    }
    for (const expectedCampaign of ['', 'Invierno 2026', ' invierno_2026 ']) {
      expect(validateRuleFields(rules({ expectedCampaign })).expectedCampaign).toBeUndefined();
    }
    const link = goodLink.replace('invierno_2026', '%20Invierno%202026%20');
    expect(
      inspect(link, {
        expectedCampaign: ' Invierno 2026 ',
        lowercaseValues: false,
        forbidSpaces: false,
      }).status,
    ).toBe('pass');
  });

  it.each([
    'https://tienda.example',
    'tienda.example/ruta',
    '*.tienda.example',
    'dominio con espacio',
  ])('rejects a domain rule that is not a bare hostname: %s', (domain) => {
    expect(validateRules(rules({ allowedDomains: [domain] })).length).toBeGreaterThan(0);
    expect(() => analyzeLinks(goodLink, rules({ allowedDomains: [domain] }))).toThrow();
  });
});
