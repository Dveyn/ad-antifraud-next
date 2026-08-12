import { matchesBotUa, matchesDatacenterIp } from './botPatterns.js';
import { extractAdSource } from './adSource.js';

/**
 * @param {import('./types.js').AntifraudConfig} config
 * @param {Object} input
 */
export function scoreVisit(config, input) {
  const {
    url,
    referer,
    userAgent = '',
    ip,
    headers,
    clientSignals = {},
    recentVisitsShort = 0,
    recentVisitsLong = 0,
  } = input;

  const signals = [];
  const source = extractAdSource(url, referer);
  const path = source.path || '/';
  const isLanding = config.adLandingPaths.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  const inScope = source.isAdTraffic || isLanding;

  if (!inScope) {
    return {
      score: 0,
      action: 'allow',
      signals: [],
      source,
      inScope: false,
    };
  }

  if (matchesBotUa(userAgent)) {
    signals.push({ code: 'bot_ua', score: 90, detail: userAgent.slice(0, 120) });
  }

  if (!userAgent || userAgent.length < 20) {
    signals.push({ code: 'empty_ua', score: 55, detail: 'Missing or too short User-Agent' });
  }

  const acceptLang = headers.get('accept-language');
  if (!acceptLang) {
    signals.push({ code: 'no_accept_language', score: 25, detail: 'No Accept-Language header' });
  }

  const accept = headers.get('accept') || '';
  if (!accept.includes('text/html') && !accept.includes('*/*')) {
    signals.push({ code: 'no_html_accept', score: 30, detail: accept.slice(0, 80) });
  }

  if (source.hasClickId && !referer) {
    signals.push({ code: 'click_id_no_referer', score: 20, detail: 'Click ID without referer' });
  }

  if (matchesDatacenterIp(ip) && source.isAdTraffic) {
    signals.push({ code: 'datacenter_ip', score: 50, detail: ip });
  }

  if (recentVisitsShort >= config.visitLimits.short.max) {
    signals.push({
      code: 'rate_short',
      score: 45,
      detail: `${recentVisitsShort} visits / 5 min`,
    });
  }
  if (recentVisitsLong >= config.visitLimits.long.max - 3) {
    signals.push({
      code: 'rate_long',
      score: 65,
      detail: `${recentVisitsLong} visits / 1 h`,
    });
  }

  const secFetchSite = headers.get('sec-fetch-site');
  const secFetchMode = headers.get('sec-fetch-mode');
  const looksModernBrowser = /Chrome|Firefox|Safari|Edg/i.test(userAgent);
  if (looksModernBrowser && !secFetchSite && !secFetchMode) {
    signals.push({ code: 'missing_sec_fetch', score: 30, detail: 'Modern UA without Sec-Fetch-*' });
  }

  if (clientSignals.webdriver) {
    signals.push({ code: 'webdriver', score: 100, detail: 'navigator.webdriver=true' });
  }
  if (clientSignals.headless) {
    signals.push({ code: 'headless_client', score: 85, detail: 'Client headless heuristics' });
  }
  if (clientSignals.automation) {
    signals.push({ code: 'automation_globals', score: 90, detail: 'Automation globals detected' });
  }
  if (clientSignals.zeroPlugins && looksModernBrowser) {
    signals.push({ code: 'zero_plugins', score: 25, detail: 'No browser plugins' });
  }

  const score = signals.reduce((sum, s) => sum + s.score, 0);

  let action = 'allow';
  if (score >= config.blockThreshold) action = 'block';
  else if (score >= config.softBlockThreshold) action = 'soft_block';

  return { score, action, signals, source, inScope: true };
}
