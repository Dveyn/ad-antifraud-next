import { normalizeIp } from './ip.js';

const BOT_UA_ALLOW = [
  /adsbot-google/i,
  /mediapartners-google/i,
  /google-inspectiontool/i,
  /yandexadnet/i,
  /yandexdirect/i,
];

const AUTOMATION_UA_PATTERNS = [
  /headless/i,
  /phantomjs/i,
  /slimerjs/i,
  /casperjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /webdriver/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /python-httpx/i,
  /aiohttp/i,
  /httpx\//i,
  /libcurl/i,
  /okhttp/i,
  /fasthttp/i,
  /go-http-client/i,
  /java\//i,
  /libwww-perl/i,
  /scrapy/i,
  /mechanize/i,
  /guzzlehttp/i,
  /httpclient/i,
  /axios\//i,
  /node-fetch/i,
  /undici/i,
  /postmanruntime/i,
];

const CRAWLER_UA_PATTERNS = [
  /bytespider/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /blexbot/i,
  /dataforseo/i,
  /serpstatbot/i,
  /screaming frog/i,
  /gptbot/i,
  /claudebot/i,
  /amazonbot/i,
  /applebot/i,
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

export const BOT_UA_PATTERNS = [...AUTOMATION_UA_PATTERNS, ...CRAWLER_UA_PATTERNS];

// Hosting ranges used by click scripts. Whole /8 blocks (3., 18., 104.) are omitted:
// they also contain office NAT and CDN addresses and were blocking real ad clicks.
export const DATACENTER_IP_PREFIXES = [
  '159.89.', '167.99.', '178.128.', '188.166.', '157.245.', '161.35.',
  '164.90.', '165.22.', '68.183.', '134.122.', '137.184.', '143.198.',
  '146.190.', '147.182.', '164.92.', '206.189.', '209.97.',
  '95.216.', '135.181.', '138.201.', '144.76.', '148.251.', '159.69.',
  '162.55.', '167.235.', '168.119.', '176.9.', '178.63.', '195.201.',
  '213.133.', '213.239.', '88.99.', '116.202.', '65.108.', '49.12.', '49.13.',
  '185.220.', '185.221.',
  '45.33.', '45.56.', '45.79.', '66.228.', '139.162.', '172.104.', '172.105.',
  '173.230.', '173.255.',
  '45.32.', '45.63.', '45.76.', '108.61.', '149.28.', '207.246.',
  '51.38.', '51.68.', '51.75.', '51.77.', '51.83.', '51.89.', '51.91.',
  '137.74.', '51.15.', '62.210.', '163.172.', '212.47.', '195.154.',
];

export function matchesBotUa(userAgent) {
  if (!userAgent || userAgent.length < 10) return false;
  if (AUTOMATION_UA_PATTERNS.some((pattern) => pattern.test(userAgent))) return true;
  if (BOT_UA_ALLOW.some((pattern) => pattern.test(userAgent))) return false;
  return CRAWLER_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export function matchesDatacenterIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  return DATACENTER_IP_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
