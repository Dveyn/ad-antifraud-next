export const BOT_UA_PATTERNS = [
  /headless/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /webdriver/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /go-http-client/i,
  /java\//i,
  /libwww-perl/i,
  /scrapy/i,
  /httpclient/i,
  /axios\//i,
  /node-fetch/i,
  /bytespider/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /bingbot/i,
  /googlebot/i,
  /yandexbot/i,
  /baiduspider/i,
  /facebookexternalhit/i,
  /telegrambot/i,
  /slurp/i,
  /duckduckbot/i,
  /crawler/i,
  /spider/i,
  /bot\b/i,
];

export const DATACENTER_IP_PREFIXES = [
  '34.', '35.', '104.', '130.', '142.',
  '52.', '54.', '18.', '3.', '13.', '15.',
  '20.', '40.', '51.', '52.', '104.',
  '185.220.', '185.221.',
  '45.33.', '45.56.', '66.228.', '139.162.',
  '159.89.', '167.99.', '178.128.', '188.166.',
  '149.28.', '157.245.', '161.35.',
  '103.21.', '103.22.', '104.16.', '104.17.',
];

export function matchesBotUa(userAgent) {
  if (!userAgent || userAgent.length < 10) return true;
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

export function matchesDatacenterIp(ip) {
  if (!ip || ip === 'unknown') return false;
  return DATACENTER_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}
