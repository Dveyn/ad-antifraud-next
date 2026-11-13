const VISITOR_HEADER_KEYS = [
  'accept',
  'accept-language',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
];

export function normalizeIp(ip) {
  if (!ip || ip === 'unknown') return '';
  let value = String(ip).trim().replace(/^::ffff:/i, '');
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  return value;
}

/** @param {Request|import('next/server').NextRequest} req */
export function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const raw = forwarded || '';
  const ip = normalizeIp((raw.split(',')[0] || realIp || '').trim());
  return ip || 'unknown';
}

/** @param {Headers} headers */
export function headersLike(headers) {
  return {
    get(name) {
      return headers.get(name);
    },
  };
}

export function headersFromMap(map) {
  return { get: (name) => sanitizeVisitorHeaders(map)[String(name).toLowerCase()] ?? null };
}

export function sanitizeVisitorHeaders(map) {
  const clean = {};
  if (!map || typeof map !== 'object') return clean;
  for (const [key, value] of Object.entries(map)) {
    const name = key.toLowerCase();
    if (!VISITOR_HEADER_KEYS.includes(name) || typeof value !== 'string' || !value) continue;
    clean[name] = value.slice(0, 300);
  }
  return clean;
}

export function pickVisitorHeaders(headers) {
  if (!headers?.get) return {};
  const map = {};
  for (const key of VISITOR_HEADER_KEYS) {
    const value = headers.get(key);
    if (value) map[key] = String(value).slice(0, 300);
  }
  return map;
}
