import { NextResponse } from 'next/server';
import { resolveConfig } from '../core/config.js';
import { scoreVisit } from '../core/scoring.js';
import { getClientIp } from '../core/ip.js';

function shouldSkip(pathname, skipPrefixes) {
  if (!pathname) return true;
  return skipPrefixes.some((p) => pathname.startsWith(p));
}

function queueLog(request, config, payload) {
  if (!config.internalSecret) return;
  const url = new URL(config.logApiPath, request.url);
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-antifraud-secret': config.internalSecret,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

/**
 * @param {import('../core/types.js').AntifraudConfig} config
 * @param {Function} score
 */
export function createMiddleware(config, score) {
  return function middleware(request) {
    if (!config.enabled) {
      return NextResponse.next();
    }

    const { pathname, search } = request.nextUrl;
    if (shouldSkip(pathname, config.skipPrefixes)) {
      return NextResponse.next();
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || '';
    const referer = request.headers.get('referer');
    const url = `${request.nextUrl.origin}${pathname}${search}`;

    const result = score({
      url,
      referer,
      userAgent,
      ip,
      headers: request.headers,
      recentVisitsShort: 0,
      recentVisitsLong: 0,
    });

    if (!result.inScope) {
      return NextResponse.next();
    }

    queueLog(request, config, {
      ip,
      userAgent,
      url,
      referer,
      result,
      layer: 'middleware',
    });

    const response =
      result.action === 'block'
        ? new NextResponse(config.blockPageHtml, {
            status: 403,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        : NextResponse.next();

    if (result.action === 'block' || result.action === 'soft_block') {
      response.cookies.set(config.cookieName, result.action, {
        maxAge: config.cookieMaxAge,
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
      });
      response.headers.set('x-ad-fraud', result.action);
      response.headers.set('x-ad-fraud-score', String(result.score));
    }

    return response;
  };
}

/** @param {import('../core/types.js').AntifraudConfig} config */
export function middlewareConfig(config) {
  return {
    matcher: config.middlewareMatcher,
  };
}

/**
 * Edge-safe middleware factory.
 * @param {import('../core/types.js').AntifraudConfig} [options]
 */
export function createAntifraudMiddleware(options = {}) {
  const config = resolveConfig(options);
  const score = (input) => scoreVisit(config, input);
  return {
    config,
    middleware: createMiddleware(config, score),
    middlewareConfig: middlewareConfig(config),
  };
}
