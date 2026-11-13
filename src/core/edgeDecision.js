import { extractAdSource } from './adSource.js';
import { pickVisitorHeaders } from './ip.js';
import { scoreVisit } from './scoring.js';

function shouldSkip(pathname, skipPrefixes) {
  if (!pathname) return true;
  return skipPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function hashPath(path) {
  let hash = 5381;
  for (let index = 0; index < path.length; index += 1) {
    hash = ((hash << 5) + hash) ^ path.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function readAndBumpVisits(value, pathname, now, limits) {
  const hash = hashPath(pathname);
  const parts = String(value || '').split('.');
  let shortCount = 0;
  let shortStart = now;
  let longCount = 0;
  let longStart = now;

  if (parts.length === 5 && parts[0] === hash) {
    shortCount = Number(parts[1]) || 0;
    shortStart = Number(parts[2]) || now;
    longCount = Number(parts[3]) || 0;
    longStart = Number(parts[4]) || now;
  }

  if (now - shortStart >= limits.short.windowMs) {
    shortCount = 0;
    shortStart = now;
  }
  if (now - longStart >= limits.long.windowMs) {
    longCount = 0;
    longStart = now;
  }

  shortCount += 1;
  longCount += 1;

  return {
    short: shortCount,
    long: longCount,
    value: `${hash}.${shortCount}.${shortStart}.${longCount}.${longStart}`,
  };
}

function isLanding(config, path) {
  return config.adLandingPaths.some((item) => path === item || path.startsWith(`${item}/`));
}

export function evaluateEdgeRequest(config, input, scoreFn) {
  const pathname = input.pathname || '/';
  if (!config.enabled || shouldSkip(pathname, config.skipPrefixes)) {
    return { skip: true };
  }

  const cookies = input.cookies || {};
  if (cookies[config.cookieName] === 'block') {
    return {
      skip: false,
      inScope: true,
      responseAction: 'block',
      log: true,
      cookiesToSet: [],
      logHeaders: pickVisitorHeaders(input.headers),
      result: {
        score: 100,
        action: 'block',
        signals: [{ code: 'prior_block', score: 100, detail: 'block cookie' }],
        source: { path: pathname, channel: 'unknown', isAdTraffic: false },
        inScope: true,
      },
    };
  }

  const search = input.search || '';
  const url = `${input.origin || ''}${pathname}${search}`;
  const source = extractAdSource(url, input.referer);
  const inScope = source.isAdTraffic || isLanding(config, source.path || pathname);
  if (!inScope) return { skip: true, inScope: false };

  const now = input.now || Date.now();
  const visits = readAndBumpVisits(
    cookies[config.visitCookieName],
    pathname,
    now,
    config.visitLimits,
  );
  const score = scoreFn || ((payload) => scoreVisit(config, payload));
  const result = score({
    url,
    referer: input.referer,
    userAgent: input.userAgent || '',
    ip: input.ip,
    headers: input.headers,
    recentVisitsShort: visits.short,
    recentVisitsLong: visits.long,
  });

  if (!result.inScope) return { skip: true, inScope: false };

  const cookiesToSet = [{
    name: config.visitCookieName,
    value: visits.value,
    maxAge: config.cookieMaxAge,
  }];
  if (result.action === 'block' || result.action === 'soft_block') {
    cookiesToSet.push({
      name: config.cookieName,
      value: result.action,
      maxAge: config.cookieMaxAge,
    });
  }

  return {
    skip: false,
    inScope: true,
    responseAction: result.action === 'block' ? 'block' : 'next',
    result,
    cookiesToSet,
    logHeaders: pickVisitorHeaders(input.headers),
    log: true,
  };
}
