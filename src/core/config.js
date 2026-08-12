/** @typedef {import('./types.js').AntifraudConfig} AntifraudConfig */

export const DEFAULT_VISIT_LIMITS = {
  short: { max: 4, windowMs: 5 * 60 * 1000 },
  long: { max: 15, windowMs: 60 * 60 * 1000 },
};

export const DEFAULT_SKIP_PREFIXES = [
  '/_next',
  '/api',
  '/img',
  '/favicon',
  '/manifest.json',
  '/robots.txt',
];

/**
 * @param {Partial<AntifraudConfig>} [overrides]
 * @returns {AntifraudConfig}
 */
export function resolveConfig(overrides = {}) {
  const env = typeof process !== 'undefined' ? process.env : {};

  return {
    enabled: overrides.enabled ?? env.ANTIFRAUD_ENABLED !== 'false',
    blockThreshold:
      overrides.blockThreshold ?? (Number(env.ANTIFRAUD_BLOCK_THRESHOLD) || 70),
    softBlockThreshold:
      overrides.softBlockThreshold ?? (Number(env.ANTIFRAUD_SOFT_THRESHOLD) || 45),
    internalSecret: overrides.internalSecret ?? env.ANTIFRAUD_INTERNAL_SECRET ?? '',
    adminToken: overrides.adminToken ?? env.ANTIFRAUD_ADMIN_TOKEN ?? '',
    adLandingPaths: overrides.adLandingPaths ?? [],
    visitLimits: overrides.visitLimits ?? DEFAULT_VISIT_LIMITS,
    cookieName: overrides.cookieName ?? 'ad_fraud',
    cookieMaxAge: overrides.cookieMaxAge ?? 60 * 60 * 24,
    logDir: overrides.logDir ?? 'data/antifraud',
    logFile: overrides.logFile ?? 'events.jsonl',
    maxLogLines: overrides.maxLogLines ?? 50000,
    blockIpDurationMs: overrides.blockIpDurationMs ?? 24 * 60 * 60 * 1000,
    logApiPath: overrides.logApiPath ?? '/api/antifraud/log',
    reportApiPath: overrides.reportApiPath ?? '/api/antifraud/report',
    skipPrefixes: overrides.skipPrefixes ?? DEFAULT_SKIP_PREFIXES,
    blockPageHtml:
      overrides.blockPageHtml ??
      '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Access denied</title></head><body><p>Access temporarily restricted.</p></body></html>',
    fraudEventName: overrides.fraudEventName ?? 'adFraudStatus',
    middlewareMatcher: overrides.middlewareMatcher ?? [
      '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
    ],
  };
}
