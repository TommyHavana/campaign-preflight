export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Severity = 'error' | 'warning';
export type ResultStatus = Severity | 'pass';

export interface Rules {
  requiredUtms: UtmKey[];
  requireHttps: boolean;
  lowercaseValues: boolean;
  forbidSpaces: boolean;
  allowedMediums: string[];
  allowedDomains: string[];
  includeSubdomains: boolean;
  expectedCampaign: string;
}

export type RuleValidationErrors = Partial<Record<keyof Rules | 'configuration', string[]>>;

export interface Finding {
  code: string;
  severity: Severity;
  field: string;
  title: string;
  explanation: string;
  suggestion: string;
}

export interface LinkResult {
  id: number;
  line: number;
  original: string;
  destination: string | null;
  hostname: string | null;
  utms: Partial<Record<UtmKey, string[]>>;
  status: ResultStatus;
  findings: Finding[];
}

export interface Report {
  results: LinkResult[];
  rules: Rules;
  summary: { total: number; pass: number; warning: number; error: number; findings: number };
}

export const DEFAULT_RULES: Rules = {
  requiredUtms: ['utm_source', 'utm_medium', 'utm_campaign'],
  requireHttps: true,
  lowercaseValues: true,
  forbidSpaces: true,
  allowedMediums: [
    'cpc',
    'paid_social',
    'email',
    'organic',
    'referral',
    'social',
    'display',
    'affiliate',
  ],
  allowedDomains: [],
  includeSubdomains: false,
  expectedCampaign: '',
};

export const MAX_LINKS = 500;
export const MAX_URL_LENGTH = 8192;
export const MAX_INPUT_LENGTH = 1_000_000;
