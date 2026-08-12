import { resolveConfig } from './core/config.js';
import { scoreVisit } from './core/scoring.js';
import { createStore } from './core/store.js';
import { createLogHandlers } from './next/handlers/log.js';
import { createReportHandler } from './next/handlers/report.js';

/**
 * Node.js-only factory with file store and API route handlers.
 * @param {import('./core/types.js').AntifraudConfig} [options]
 */
export function createAntifraudNode(options = {}) {
  const config = resolveConfig(options);
  const store = createStore(config);
  const score = (input) => scoreVisit(config, input);

  return {
    config,
    store,
    scoreVisit: score,
    isIpBlocked: (ip) => store.isIpBlocked(ip),
    blockIp: (ip, durationMs) => store.blockIp(ip, durationMs),
    appendEvent: (event) => store.appendEvent(event),
    trackVisit: (ip, pathname) => store.trackVisit(ip, pathname),
    readEvents: (opts) => store.readEvents(opts),
    buildReport: (opts) => store.buildReport(opts),
    eventFromScoreResult: (payload) => store.eventFromScoreResult(payload),
    logHandlers: createLogHandlers(config, store, score),
    reportHandler: createReportHandler(config, store),
  };
}

/** Alias */
export { createAntifraudNode as createAntifraud };
