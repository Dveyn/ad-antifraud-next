/** @param {Request|import('next/server').NextRequest} req */
export function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const raw = forwarded || '';
  const ip = (raw.split(',')[0] || realIp || 'unknown').trim();
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
