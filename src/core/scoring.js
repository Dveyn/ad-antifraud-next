import { matchesBotUa, matchesDatacenterIp } from './botPatterns.js';
import { extractAdSource } from './adSource.js';
import { headerSignals, platformContradicts } from './coherence.js';

export function actionFor(config, score) {
  if (score >= config.blockThreshold) return 'block';
  if (score >= config.softBlockThreshold) return 'soft_block';
  return 'allow';
}

export function collectVisitSignals(config, input) {
  const signals = [];
  const recentVisitsShort = input.recentVisitsShort || 0;
  const recentVisitsLong = input.recentVisitsLong || 0;
  const recentIpShort = input.recentIpShort || 0;

  if (recentVisitsShort >= config.visitLimits.short.max) {
    signals.push({
      code: 'rate_short',
      score: 75,
      detail: `${recentVisitsShort} visits / short window`,
    });
  }
  if (recentVisitsLong >= config.visitLimits.long.max) {
    signals.push({
      code: 'rate_long',
      score: 65,
      detail: `${recentVisitsLong} visits / long window`,
    });
  }
  if (recentIpShort >= config.visitLimits.short.max * 2) {
    signals.push({
      code: 'rate_ip',
      score: 70,
      detail: `${recentIpShort} ip hits / short window`,
    });
  }
  if ((input.clickIdReplay || 0) >= 1) {
    signals.push({
      code: 'click_id_replay',
      score: 80,
      detail: 'Click id seen from another IP',
    });
  }
  if ((input.clickIdChurn || 0) >= 8) {
    signals.push({
      code: 'click_id_churn',
      score: 75,
      detail: `${input.clickIdChurn} click ids / hour`,
    });
  }
  return signals;
}

export function applySignals(config, result, extraSignals) {
  const signals = [...(result.signals || [])];
  for (const signal of extraSignals) {
    if (!signals.some((item) => item.code === signal.code)) signals.push(signal);
  }
  const score = signals.reduce((sum, signal) => sum + signal.score, 0);
  return { ...result, signals, score, action: actionFor(config, score) };
}

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
    trustHeaders = true,
  } = input;

  const signals = [];
  const source = extractAdSource(url, referer);
  const path = source.path || '/';
  const isLanding = config.adLandingPaths.some(
    (item) => path === item || path.startsWith(`${item}/`),
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
  } else if (!userAgent || userAgent.length < 20) {
    signals.push({
      code: 'empty_ua',
      score: !userAgent || userAgent.length < 10 ? 80 : 55,
      detail: 'Missing or too short User-Agent',
    });
  }

  if (trustHeaders && headers?.get) {
    const acceptLang = headers.get('accept-language');
    if (!acceptLang) {
      signals.push({ code: 'no_accept_language', score: 25, detail: 'No Accept-Language header' });
    }

    const accept = headers.get('accept') || '';
    if (!accept.includes('text/html') && !accept.includes('*/*')) {
      signals.push({ code: 'no_html_accept', score: 30, detail: accept.slice(0, 80) });
    }

    const secFetchSite = headers.get('sec-fetch-site');
    const secFetchMode = headers.get('sec-fetch-mode');
    const looksModernBrowser = /Chrome|Firefox|Safari|Edg/i.test(userAgent);
    if (looksModernBrowser && !secFetchSite && !secFetchMode) {
      signals.push({ code: 'missing_sec_fetch', score: 30, detail: 'Modern UA without Sec-Fetch-*' });
    }

    signals.push(...headerSignals(userAgent, headers));
  }

  if (source.hasClickId && !referer) {
    signals.push({ code: 'click_id_no_referer', score: 20, detail: 'Click ID without referer' });
  }
  if (source.malformedClickId) {
    signals.push({ code: 'malformed_click_id', score: 80, detail: 'Click id shape is invalid' });
  }
  if (source.mixedClickIds) {
    signals.push({
      code: 'mixed_click_ids',
      score: 35,
      detail: (source.clickFamilies || []).join(','),
    });
  }
  if (source.refererMismatch) {
    signals.push({
      code: 'click_referer_mismatch',
      score: 40,
      detail: source.refererHost || '',
    });
  }

  if (matchesDatacenterIp(ip) && source.isAdTraffic) {
    signals.push({ code: 'datacenter_ip', score: 50, detail: ip });
  }

  signals.push(...collectVisitSignals(config, input));

  const looksModernBrowser = /Chrome|Firefox|Safari|Edg/i.test(userAgent);
  const mobileUa = /Android|iPhone|iPad|Mobile/i.test(userAgent);
  const desktopChromium = /Chrome\/|Edg\//.test(userAgent) && !mobileUa;

  if (clientSignals.webdriver) {
    signals.push({ code: 'webdriver', score: 100, detail: 'navigator.webdriver=true' });
  }
  if (clientSignals.headless) {
    signals.push({ code: 'headless_client', score: 85, detail: 'Client headless heuristics' });
  }
  if (clientSignals.automation) {
    signals.push({ code: 'automation_globals', score: 90, detail: 'Automation globals detected' });
  }
  if (clientSignals.zeroPlugins && looksModernBrowser && desktopChromium) {
    signals.push({ code: 'zero_plugins', score: 25, detail: 'No browser plugins' });
  }
  if (clientSignals.outerEmpty) {
    signals.push({ code: 'zero_window', score: 55, detail: 'outerWidth and outerHeight are 0' });
  }
  if (typeof clientSignals.screen === 'string' && /^(?:0x0|1x1|0x\d+|\d+x0)$/.test(clientSignals.screen)) {
    signals.push({ code: 'suspicious_viewport', score: 40, detail: clientSignals.screen });
  }
  if (clientSignals.platform && platformContradicts(userAgent, clientSignals.platform)) {
    signals.push({ code: 'platform_mismatch', score: 45, detail: String(clientSignals.platform).slice(0, 40) });
  }
  if (clientSignals.brands && /Chrome\//.test(userAgent) && !/Chrom/i.test(clientSignals.brands)) {
    signals.push({
      code: 'ua_brand_mismatch',
      score: 30,
      detail: String(clientSignals.brands).slice(0, 80),
    });
  }

  const score = signals.reduce((sum, signal) => sum + signal.score, 0);
  return { score, action: actionFor(config, score), signals, source, inScope: true };
}
