import { DEFAULT_RULES, type Rules } from '../domain/types';

export type RuleSettings = Omit<Rules, 'allowedMediums' | 'allowedDomains'> & {
  mediumsText: string;
  domainsText: string;
};

export const INITIAL_SETTINGS: RuleSettings = {
  requiredUtms: [...DEFAULT_RULES.requiredUtms],
  requireHttps: DEFAULT_RULES.requireHttps,
  lowercaseValues: DEFAULT_RULES.lowercaseValues,
  forbidSpaces: DEFAULT_RULES.forbidSpaces,
  includeSubdomains: DEFAULT_RULES.includeSubdomains,
  expectedCampaign: DEFAULT_RULES.expectedCampaign,
  mediumsText: DEFAULT_RULES.allowedMediums.join(', '),
  domainsText: '',
};

export function settingsToRules(settings: RuleSettings): Rules {
  const { mediumsText, domainsText, ...rules } = settings;
  const split = (value: string) => [
    ...new Set(
      value
        .split(/[,\r\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  return { ...rules, allowedMediums: split(mediumsText), allowedDomains: split(domainsText) };
}

/** Compare effective rule sets, not commas, spacing or the order of the editor's lists. */
export function ruleSignature(rules: Rules): string {
  return JSON.stringify({
    ...rules,
    requiredUtms: [...rules.requiredUtms].sort(),
    allowedMediums: [...rules.allowedMediums].sort(),
    allowedDomains: [
      ...new Set(rules.allowedDomains.map((domain) => domain.toLowerCase().replace(/\.$/, ''))),
    ].sort(),
  });
}
