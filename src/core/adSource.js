const AD_PARAM_KEYS = [
  'yclid',
  'ysclid',
  'gclid',
  'wbraid',
  'gbraid',
  'fbclid',
  'msclkid',
  'ttclid',
  'rb_clickid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'from',
  'openstat',
];

const CLICK_ID_KEYS = [
  'yclid',
  'ysclid',
  'gclid',
  'wbraid',
  'gbraid',
  'fbclid',
  'msclkid',
  'ttclid',
  'rb_clickid',
];

const FAMILY_KEYS = [
  ['yandex', ['yclid', 'ysclid']],
  ['google', ['gclid', 'wbraid', 'gbraid']],
  ['meta', ['fbclid']],
  ['microsoft', ['msclkid']],
  ['tiktok', ['ttclid']],
  ['vk', ['rb_clickid']],
];

const CHANNEL_BY_FAMILY = {
  yandex: 'yandex_direct',
  google: 'google_ads',
  meta: 'meta_ads',
  microsoft: 'microsoft_ads',
  tiktok: 'tiktok_ads',
  vk: 'vk_ads',
};

const AD_MEDIUM_VALUES = new Set(['cpc', 'ppc', 'paid', 'cpm', 'display', 'retargeting']);

const AD_REFERER_HOSTS = [
  'yandex.ru',
  'ya.ru',
  'google.com',
  'google.ru',
  'vk.com',
  'mail.ru',
  'ok.ru',
  'direct.yandex.ru',
  'ads.google.com',
];

const JUNK_CLICK_ID = /^(?:undefined|null|test|nan|0|1|\[yclid\]|\[gclid\]|\{yclid\}|\{gclid\})$/i;

export function extractAdSource(url, referer) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return emptySource();
  }

  const params = parsed.searchParams;
  const utm = {};
  for (const key of AD_PARAM_KEYS) {
    const val = params.get(key);
    if (val) utm[key] = val.slice(0, 500);
  }

  let refererHost = null;
  if (referer) {
    try {
      refererHost = new URL(referer).hostname.replace(/^www\./, '');
    } catch {
      refererHost = null;
    }
  }

  const clickFamilies = FAMILY_KEYS
    .filter(([, keys]) => keys.some((key) => utm[key]))
    .map(([name]) => name);
  const hasClickId = clickFamilies.length > 0;
  const hasUtm = Boolean(utm.utm_source || utm.utm_medium || utm.utm_campaign);
  const isPaidMedium = utm.utm_medium ? AD_MEDIUM_VALUES.has(utm.utm_medium.toLowerCase()) : false;
  const isAdReferer = refererHost
    ? AD_REFERER_HOSTS.some((host) => refererHost === host || refererHost.endsWith(`.${host}`))
    : false;
  const isAdTraffic = hasClickId || isPaidMedium || (hasUtm && isAdReferer);
  const mixedClickIds = clickFamilies.length > 1;
  const malformedClickId = CLICK_ID_KEYS.some((key) => utm[key] && isMalformedClickId(key, utm[key]));
  const refererNetwork = detectRefererNetwork(refererHost);
  const refererMismatch = !mixedClickIds && (
    (clickFamilies.includes('yandex') && refererNetwork === 'google')
    || (clickFamilies.includes('google') && refererNetwork === 'yandex')
  );

  let channel = 'organic';
  if (mixedClickIds) channel = 'mixed';
  else if (clickFamilies[0]) channel = CHANNEL_BY_FAMILY[clickFamilies[0]];
  else if (utm.utm_source && /yandex|direct/i.test(utm.utm_source)) channel = 'yandex_direct';
  else if (utm.utm_source && /google/i.test(utm.utm_source)) channel = 'google_ads';
  else if (utm.utm_source && /facebook|fb|instagram|meta/i.test(utm.utm_source)) channel = 'meta_ads';
  else if (utm.utm_source && /vk/i.test(utm.utm_source)) channel = 'vk_ads';
  else if (isAdTraffic) channel = 'paid_other';

  return {
    ...utm,
    referer: referer ? referer.slice(0, 500) : null,
    refererHost,
    channel,
    isAdTraffic,
    hasClickId,
    clickFamilies,
    mixedClickIds,
    malformedClickId,
    refererMismatch,
    path: parsed.pathname,
  };
}

export function collectClickIds(source) {
  if (!source) return [];
  return CLICK_ID_KEYS.map((key) => source[key]).filter(Boolean);
}

function isMalformedClickId(key, value) {
  if (JUNK_CLICK_ID.test(value) || /[\s<>"']/.test(value) || value.length < 6) return true;
  if (key === 'yclid' || key === 'ysclid') return !/^\d+$/.test(value);
  if (key === 'gclid' || key === 'wbraid' || key === 'gbraid') return !/^[A-Za-z0-9_-]+$/.test(value);
  return false;
}

function detectRefererNetwork(host) {
  if (!host) return null;
  if (
    host === 'ya.ru'
    || host === 'yandex.ru'
    || host.endsWith('.yandex.ru')
    || host.endsWith('.yandex.com')
    || host.endsWith('.yandex.by')
  ) return 'yandex';
  if (
    host === 'google.com'
    || host === 'google.ru'
    || host.endsWith('.google.com')
    || host.endsWith('.google.ru')
  ) return 'google';
  return null;
}

function emptySource() {
  return {
    referer: null,
    refererHost: null,
    channel: 'unknown',
    isAdTraffic: false,
    hasClickId: false,
    clickFamilies: [],
    mixedClickIds: false,
    malformedClickId: false,
    refererMismatch: false,
    path: '/',
  };
}

export function formatSourceLabel(source) {
  const parts = [];
  if (source.channel && source.channel !== 'organic') parts.push(source.channel);
  if (source.utm_source) parts.push(`src:${source.utm_source}`);
  if (source.utm_campaign) parts.push(`cmp:${source.utm_campaign}`);
  if (source.yclid) parts.push(`yclid:${source.yclid.slice(0, 12)}`);
  if (source.ysclid) parts.push(`ysclid:${source.ysclid.slice(0, 12)}`);
  if (source.gclid) parts.push(`gclid:${source.gclid.slice(0, 12)}`);
  if (source.wbraid) parts.push(`wbraid:${source.wbraid.slice(0, 12)}`);
  if (source.refererHost) parts.push(`ref:${source.refererHost}`);
  return parts.length ? parts.join(' | ') : 'direct/organic';
}
