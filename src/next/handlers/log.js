import { NextResponse } from 'next/server';
import { collectClickIds, extractAdSource } from '../../core/adSource.js';
import { getClientIp } from '../../core/ip.js';
import { applySignals } from '../../core/scoring.js';
import { finalizeLoggedVisit } from '../../core/serverScore.js';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * @param {import('../../core/types.js').AntifraudConfig} config
 * @param {ReturnType<import('../../core/store.js').createStore>} store
 * @param {Function} score
 */
export function createLogHandlers(config, store, score) {
  async function POST(req) {
    const secret = req.headers.get('x-antifraud-secret');
    if (!config.internalSecret || secret !== config.internalSecret) {
      return unauthorized();
    }

    try {
      const body = await req.json();
      const { ip, userAgent, url, referer, result, layer } = body;

      if (!result?.inScope) {
        return NextResponse.json({ ok: true, skipped: true });
      }

      const pathname = result?.source?.path || '/';
      const visits = store.trackVisit(ip, pathname);
      const clicks = store.rememberClickIds(ip, collectClickIds(result?.source));
      const finalResult = finalizeLoggedVisit(config, result, {
        url,
        referer,
        userAgent,
        ip,
        headerMap: body.headers,
        visits,
        clicks,
        previouslyBlocked: store.isIpBlocked(ip),
      });
      const event = store.eventFromScoreResult({
        ip,
        userAgent,
        url,
        referer,
        result: finalResult,
        layer: layer || 'server',
      });

      store.appendEvent(event);

      if (finalResult.action === 'block') {
        store.blockIp(ip);
      }

      return NextResponse.json({
        ok: true,
        action: finalResult.action,
        score: finalResult.score,
      });
    } catch (err) {
      console.error('[ad-antifraud/log POST]', err);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
  }

  async function PUT(req) {
    try {
      const ip = getClientIp(req);
      const body = await req.json();
      const { url, referer, userAgent, clientSignals } = body;

      const pathname = (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return '/';
        }
      })();

      const preview = extractAdSource(url, referer);
      const visits = store.trackVisit(ip, pathname);
      const clicks = store.rememberClickIds(ip, collectClickIds(preview));
      let result = score({
        url,
        referer,
        userAgent: userAgent || req.headers.get('user-agent') || '',
        ip,
        headers: req.headers,
        clientSignals,
        recentVisitsShort: visits.short,
        recentVisitsLong: visits.long,
        recentIpShort: visits.ipShort,
        recentIpLong: visits.ipLong,
        clickIdReplay: clicks.replay,
        clickIdChurn: clicks.churn,
      });
      if (store.isIpBlocked(ip)) {
        result = applySignals(config, result, [{
          code: 'prior_block',
          score: 100,
          detail: 'ip block list',
        }]);
      }

      if (!result.inScope) {
        return NextResponse.json({ ok: true, action: 'allow', score: 0 });
      }

      const event = store.eventFromScoreResult({
        ip,
        userAgent: userAgent || req.headers.get('user-agent'),
        url,
        referer,
        result,
        layer: 'beacon',
      });
      store.appendEvent(event);

      if (result.action === 'block') {
        store.blockIp(ip);
      }

      return NextResponse.json({
        ok: true,
        action: result.action,
        score: result.score,
        signals: result.signals.map((s) => s.code),
      });
    } catch (err) {
      console.error('[ad-antifraud/log PUT]', err);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
  }

  return { POST, PUT };
}

export { createLogHandlers as default };
