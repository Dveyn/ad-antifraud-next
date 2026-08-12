const AD_PARAM_KEYS = [
  'yclid',
  'gclid',
  'fbclid',
  'msclkid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'from',
  'openstat',
];

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

  const hasClickId = Boolean(utm.yclid || utm.gclid || utm.fbclid || utm.msclkid);
  const hasUtm = Boolean(utm.utm_source || utm.utm_medium || utm.utm_campaign);
  const isPaidMedium = utm.utm_medium ? AD_MEDIUM_VALUES.has(utm.utm_medium.toLowerCase()) : false;
  const isAdReferer = refererHost
    ? AD_REFERER_HOSTS.some((h) => refererHost === h || refererHost.endsWith(`.${h}`))
    : false;

  const isAdTraffic = hasClickId || isPaidMedium || (hasUtm && isAdReferer);

  let channel = 'organic';
  if (utm.yclid || (utm.utm_source && /yandex|direct/i.test(utm.utm_source))) {
    channel = 'yandex_direct';
  } else if (utm.gclid || (utm.utm_source && /google/i.test(utm.utm_source))) {
    channel = 'google_ads';
  } else if (utm.fbclid || (utm.utm_source && /facebook|fb|instagram|meta/i.test(utm.utm_source || ''))) {
    channel = 'meta_ads';
  } else if (utm.utm_source && /vk/i.test(utm.utm_source)) {
    channel = 'vk_ads';
  } else if (isAdTraffic) {
    channel = 'paid_other';
  }

  return {
    ...utm,
    referer: referer ? referer.slice(0, 500) : null,
    refererHost,
    channel,
    isAdTraffic,
    hasClickId,
    path: parsed.pathname,
  };
}

function emptySource() {
  return {
    referer: null,
    refererHost: null,
    channel: 'unknown',
    isAdTraffic: false,
    hasClickId: false,
    path: '/',
  };
}

export function formatSourceLabel(source) {
  const parts = [];
  if (source.channel && source.channel !== 'organic') parts.push(source.channel);
  if (source.utm_source) parts.push(`src:${source.utm_source}`);
  if (source.utm_campaign) parts.push(`cmp:${source.utm_campaign}`);
  if (source.yclid) parts.push(`yclid:${source.yclid.slice(0, 12)}…`);
  if (source.gclid) parts.push(`gclid:${source.gclid.slice(0, 12)}…`);
  if (source.refererHost) parts.push(`ref:${source.refererHost}`);
  return parts.length ? parts.join(' | ') : 'direct/organic';
}
