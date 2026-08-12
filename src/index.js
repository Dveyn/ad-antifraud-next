export { createAntifraudMiddleware } from './next/middleware.js';
export { resolveConfig, DEFAULT_VISIT_LIMITS, DEFAULT_SKIP_PREFIXES } from './core/config.js';
export { extractAdSource, formatSourceLabel } from './core/adSource.js';
export { matchesBotUa, matchesDatacenterIp } from './core/botPatterns.js';
export { getClientIp } from './core/ip.js';
export { scoreVisit } from './core/scoring.js';
