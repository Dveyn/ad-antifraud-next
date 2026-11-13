import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../src/core/config.js';
import { scoreVisit } from '../src/core/scoring.js';
import { extractAdSource } from '../src/core/adSource.js';
import { matchesBotUa, matchesDatacenterIp } from '../src/core/botPatterns.js';
import { finalizeLoggedVisit } from '../src/core/serverScore.js';
import { evaluateEdgeRequest } from '../src/core/edgeDecision.js';
import { createStore } from '../src/core/store.js';
import { getClientIp } from '../src/core/ip.js';

const config = resolveConfig({ adLandingPaths: ['/landing'] });

const chromeUa =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function headers(map) {
  const lower = {};
  for (const [key, value] of Object.entries(map)) lower[key.toLowerCase()] = value;
  return { get: (name) => lower[name.toLowerCase()] ?? null };
}

const humanHeaders = headers({
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'ru-RU,ru;q=0.9',
  'sec-fetch-site': 'cross-site',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
});

function visit(extra = {}) {
  return scoreVisit(config, {
    url: 'https://site.test/landing?yclid=1234567890123',
    referer: 'https://yandex.ru/search/?text=test',
    userAgent: chromeUa,
    ip: '176.59.10.20',
    headers: humanHeaders,
    ...extra,
  });
}

function codes(result) {
  return result.signals.map((signal) => signal.code);
}

test('a normal Yandex click stays allow', () => {
  const result = visit();
  assert.equal(result.action, 'allow');
  assert.equal(result.source.channel, 'yandex_direct');
  assert.equal(result.score, 0);
});

test('wbraid is paid Google traffic even without gclid', () => {
  const source = extractAdSource(
    `https://site.test/promo?wbraid=${'a'.repeat(24)}`,
    'https://www.google.com/',
  );
  assert.equal(source.isAdTraffic, true);
  assert.equal(source.channel, 'google_ads');
  assert.equal(source.hasClickId, true);
});

test('ysclid is Yandex traffic', () => {
  const source = extractAdSource(
    'https://site.test/promo?ysclid=9876543210987',
    'https://ya.ru/',
  );
  assert.equal(source.channel, 'yandex_direct');
  assert.equal(source.isAdTraffic, true);
});

test('garbage yclid is malformed and does not look like a browser refresh', () => {
  const result = visit({ url: 'https://site.test/landing?yclid=test' });
  assert.ok(codes(result).includes('malformed_click_id'));
  assert.equal(result.action, 'block');
});

test('two ad networks on one url are mixed, not an instant block', () => {
  const result = visit({
    url: `https://site.test/landing?yclid=1234567890123&gclid=${'B'.repeat(24)}`,
    referer: 'https://yandex.ru/',
  });
  assert.equal(result.source.channel, 'mixed');
  assert.ok(codes(result).includes('mixed_click_ids'));
  assert.notEqual(result.action, 'block');
});

test('yclid opened from Google is a referer mismatch', () => {
  const result = visit({ referer: 'https://www.google.com/search?q=1' });
  assert.ok(codes(result).includes('click_referer_mismatch'));
});

test('same click id from another IP is replay fraud', () => {
  const result = visit({ clickIdReplay: 1 });
  assert.ok(codes(result).includes('click_id_replay'));
  assert.equal(result.action, 'block');
});

test('many distinct click ids from one IP add churn', () => {
  const result = visit({ clickIdChurn: 8 });
  assert.ok(codes(result).includes('click_id_churn'));
  assert.equal(result.action, 'block');
});

test('an automation client cannot hide behind an ad verifier name', () => {
  assert.equal(matchesBotUa('curl/8.6.0 AdsBot-Google'), true);
});

test('AdsBot-Google is not classified as a bot', () => {
  const ua = 'Mozilla/5.0 (compatible; AdsBot-Google; +http://www.google.com/adsbot.html)';
  assert.equal(matchesBotUa(ua), false);
  const result = visit({
    userAgent: ua,
    headers: headers({ accept: 'text/html', 'accept-language': 'en' }),
  });
  assert.ok(!codes(result).includes('bot_ua'));
});

test('headless and script clients are bots', () => {
  assert.equal(matchesBotUa('python-httpx/0.27'), true);
  assert.equal(matchesBotUa('Mozilla/5.0 HeadlessChrome/130.0'), true);
  const result = visit({ userAgent: 'curl/8.6.0' });
  assert.ok(codes(result).includes('bot_ua'));
  assert.equal(result.action, 'block');
});

test('short user agent is not scored twice', () => {
  const result = visit({ userAgent: 'curl' });
  assert.ok(codes(result).includes('empty_ua'));
  assert.ok(!codes(result).includes('bot_ua'));
  assert.equal(result.signals.filter((signal) => signal.code === 'empty_ua').length, 1);
});

test('whole cloud /8 ranges are not treated as datacenters', () => {
  assert.equal(matchesDatacenterIp('3.120.10.10'), false);
  assert.equal(matchesDatacenterIp('104.16.1.1'), false);
  assert.equal(matchesDatacenterIp('18.196.1.1'), false);
});

test('known VPS prefixes and IPv4-mapped addresses still match', () => {
  assert.equal(matchesDatacenterIp('159.89.10.10'), true);
  assert.equal(matchesDatacenterIp('::ffff:95.216.10.10'), true);
});

test('datacenter IP on an ad click is still a signal', () => {
  const result = visit({ ip: '159.89.10.10' });
  assert.ok(codes(result).includes('datacenter_ip'));
});

test('Chrome document without client hints is suspicious', () => {
  const result = visit({
    headers: headers({
      accept: 'text/html',
      'accept-language': 'ru',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
    }),
  });
  assert.ok(codes(result).includes('missing_client_hints'));
});

test('Windows UA with an Android client hint mismatches', () => {
  const result = visit({
    headers: headers({
      ...{
        accept: humanHeaders.get('accept'),
        'accept-language': 'ru',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
        'sec-ch-ua': '"Chromium";v="130"',
        'sec-ch-ua-platform': '"Android"',
      },
    }),
  });
  assert.ok(codes(result).includes('ua_hint_mismatch'));
});

test('mobile Chrome with zero plugins is not a desktop headless signal', () => {
  const result = visit({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    headers: headers({
      accept: 'text/html',
      'accept-language': 'ru',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
    }),
    clientSignals: { zeroPlugins: true, platform: 'Linux armv81', mobileHint: true },
  });
  assert.ok(!codes(result).includes('zero_plugins'));
  assert.equal(result.action, 'allow');
});

test('desktop Chrome with an empty window is scored', () => {
  const result = visit({
    clientSignals: { outerEmpty: true, screen: '0x0', zeroPlugins: true, platform: 'Win32' },
  });
  assert.ok(codes(result).includes('zero_window'));
  assert.ok(codes(result).includes('suspicious_viewport'));
  assert.ok(codes(result).includes('zero_plugins'));
});

test('rate limit uses the configured max, including IP-wide bursts', () => {
  const atMax = visit({ recentVisitsLong: config.visitLimits.long.max });
  assert.ok(codes(atMax).includes('rate_long'));
  const early = visit({ recentVisitsLong: config.visitLimits.long.max - 3 });
  assert.ok(!codes(early).includes('rate_long'));
  const burst = visit({ recentIpShort: config.visitLimits.short.max * 2 });
  assert.ok(codes(burst).includes('rate_ip'));
});

test('empty log-request headers would punish a real Chrome visit', () => {
  const punished = visit({ headers: { get: () => null } });
  assert.ok(punished.score >= config.softBlockThreshold);
});

test('logged visit keeps the visitor headers and does not invent penalties', () => {
  const middlewareResult = visit();
  const finalResult = finalizeLoggedVisit(config, middlewareResult, {
    url: 'https://site.test/landing?yclid=1234567890123',
    referer: 'https://yandex.ru/search/?text=test',
    userAgent: chromeUa,
    ip: '176.59.10.20',
    headerMap: {
      accept: humanHeaders.get('accept'),
      'accept-language': 'ru-RU,ru;q=0.9',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
    visits: { short: 1, long: 1, ipShort: 1, ipLong: 1 },
    clicks: { replay: 0, churn: 1 },
  });
  assert.equal(finalResult.action, 'allow');
  assert.equal(finalResult.score, 0);
});

test('missing header snapshot preserves the middleware verdict', () => {
  const middlewareResult = visit();
  const finalResult = finalizeLoggedVisit(config, middlewareResult, {
    url: 'https://site.test/landing?yclid=1234567890123',
    referer: 'https://yandex.ru/search/?text=test',
    userAgent: chromeUa,
    ip: '176.59.10.20',
    headerMap: null,
    visits: { short: 1, long: 1, ipShort: 1, ipLong: 1 },
    clicks: { replay: 0, churn: 1 },
  });
  assert.equal(finalResult.action, 'allow');
  assert.ok(!codes(finalResult).includes('missing_sec_fetch'));
  assert.ok(!codes(finalResult).includes('no_accept_language'));
});

test('server replay still blocks when the edge score was clean', () => {
  const middlewareResult = visit();
  const finalResult = finalizeLoggedVisit(config, middlewareResult, {
    url: 'https://site.test/landing?yclid=1234567890123',
    referer: 'https://yandex.ru/search/?text=test',
    userAgent: chromeUa,
    ip: '176.59.10.20',
    headerMap: null,
    visits: { short: 1, long: 1, ipShort: 1, ipLong: 1 },
    clicks: { replay: 2, churn: 1 },
  });
  assert.equal(finalResult.action, 'block');
  assert.ok(codes(finalResult).includes('click_id_replay'));
});

test('edge honors a previous block cookie outside the landing path', () => {
  const decision = evaluateEdgeRequest(config, {
    pathname: '/thanks',
    search: '',
    origin: 'https://site.test',
    referer: null,
    userAgent: chromeUa,
    ip: '176.59.10.20',
    headers: humanHeaders,
    cookies: { [config.cookieName]: 'block' },
    now: 1_700_000_000_000,
  });
  assert.equal(decision.responseAction, 'block');
  assert.ok(decision.result.signals.some((signal) => signal.code === 'prior_block'));
});

test('edge counts repeated landing hits up to the short limit', () => {
  let cookies = {};
  let blocked = false;
  const now = 1_700_000_000_000;
  for (let hit = 0; hit < config.visitLimits.short.max; hit += 1) {
    const decision = evaluateEdgeRequest(config, {
      pathname: '/landing',
      search: '?yclid=1234567890123',
      origin: 'https://site.test',
      referer: 'https://yandex.ru/',
      userAgent: chromeUa,
      ip: '176.59.10.20',
      headers: humanHeaders,
      cookies,
      now: now + hit * 1000,
    });
    cookies = {};
    for (const cookie of decision.cookiesToSet || []) cookies[cookie.name] = cookie.value;
    blocked = decision.responseAction === 'block';
  }
  assert.equal(blocked, true);
});

test('store collapses the middleware log and the beacon into one visit', () => {
  const store = createStore(config);
  const first = store.trackVisit('176.59.10.20', '/landing');
  const second = store.trackVisit('176.59.10.20', '/landing');
  assert.equal(first.short, 1);
  assert.equal(second.short, 1);
});

test('store reports click id reuse from a different IP and ignores a refresh', () => {
  const store = createStore(config);
  const first = store.rememberClickIds('176.59.10.20', ['1234567890123']);
  const refresh = store.rememberClickIds('176.59.10.20', ['1234567890123']);
  const otherIp = store.rememberClickIds('95.153.1.1', ['1234567890123']);
  assert.equal(first.replay, 0);
  assert.equal(refresh.replay, 0);
  assert.equal(otherIp.replay, 1);
});

test('client IP normalizes a mapped v4 address', () => {
  const req = {
    headers: {
      get(name) {
        if (name === 'x-forwarded-for') return '::ffff:176.59.10.20, 10.0.0.1';
        return null;
      },
    },
  };
  assert.equal(getClientIp(req), '176.59.10.20');
});
