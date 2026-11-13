import { NextResponse } from 'next/server';
import { resolveConfig } from '../core/config.js';
import { evaluateEdgeRequest } from '../core/edgeDecision.js';
import { scoreVisit } from '../core/scoring.js';
import { getClientIp } from '../core/ip.js';

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
    const { pathname, search } = request.nextUrl;
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || '';
    const referer = request.headers.get('referer');
    const decision = evaluateEdgeRequest(config, {
      pathname,
      search,
      origin: request.nextUrl.origin,
      referer,
      userAgent,
      ip,
      headers: request.headers,
      cookies: {
        [config.cookieName]: request.cookies?.get?.(config.cookieName)?.value,
        [config.visitCookieName]: request.cookies?.get?.(config.visitCookieName)?.value,
      },
    }, score);

    if (decision.skip) return NextResponse.next();

    queueLog(request, config, {
      ip,
      userAgent,
      url: `${request.nextUrl.origin}${pathname}${search}`,
      referer,
      headers: decision.logHeaders,
      result: decision.result,
      layer: 'middleware',
    });

    const response = decision.responseAction === 'block'
      ? new NextResponse(config.blockPageHtml, {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      : NextResponse.next();

    for (const cookie of decision.cookiesToSet || []) {
      response.cookies.set(cookie.name, cookie.value, {
        maxAge: cookie.maxAge,
        httpOnly: cookie.name === config.visitCookieName,
        sameSite: 'lax',
        path: '/',
      });
    }

    if (decision.result?.action === 'block' || decision.result?.action === 'soft_block') {
      response.headers.set('x-ad-fraud', decision.result.action);
      response.headers.set('x-ad-fraud-score', String(decision.result.score));
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
