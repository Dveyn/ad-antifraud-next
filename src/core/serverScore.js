import { headersFromMap, sanitizeVisitorHeaders } from './ip.js';
import { applySignals, collectVisitSignals, scoreVisit } from './scoring.js';

export function finalizeLoggedVisit(config, middlewareResult, context) {
  const visits = context.visits || {};
  const clicks = context.clicks || {};
  const headerMap = sanitizeVisitorHeaders(context.headerMap);
  const visitInput = {
    recentVisitsShort: visits.short || 0,
    recentVisitsLong: visits.long || 0,
    recentIpShort: visits.ipShort || 0,
    recentIpLong: visits.ipLong || 0,
    clickIdReplay: clicks.replay || 0,
    clickIdChurn: clicks.churn || 0,
  };

  let result = Object.keys(headerMap).length
    ? scoreVisit(config, {
      url: context.url,
      referer: context.referer,
      userAgent: context.userAgent,
      ip: context.ip,
      headers: headersFromMap(headerMap),
      trustHeaders: true,
      ...visitInput,
    })
    : applySignals(config, middlewareResult, collectVisitSignals(config, visitInput));

  if (context.previouslyBlocked) {
    result = applySignals(config, result, [{
      code: 'prior_block',
      score: 100,
      detail: 'ip block list',
    }]);
  }

  return result;
}
