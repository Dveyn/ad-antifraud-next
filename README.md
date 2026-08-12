# ad-antifraud-next

[![npm version](https://img.shields.io/npm/v/ad-antifraud-next.svg)](https://www.npmjs.com/package/ad-antifraud-next)
[![npm downloads](https://img.shields.io/npm/dm/ad-antifraud-next.svg)](https://www.npmjs.com/package/ad-antifraud-next)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Dveyn/ad-antifraud-next.svg)](https://github.com/Dveyn/ad-antifraud-next)

Anti-fraud toolkit for **paid ad traffic** in Next.js App Router.

Blocks bot clicks, logs IP addresses and traffic sources (Yandex Direct, Google Ads, VK, UTM), protects analytics counters and forms from fake conversions.

**Languages:** [English](README.md) | [Русский](README.ru.md)

Works with **npm**, **yarn**, and **pnpm** (all use the npm registry).

## Features

- Edge middleware - first-line bot blocking (403)
- Client beacon - headless browser and automation detection
- JSONL event log - IP, yclid, gclid, utm, referer, user-agent, score
- Report API - top fraud IPs and ad sources for refund requests
- Soft block - page loads but trackers are disabled
- Form protection - block submissions from fraud IPs

## Install

```bash
npm install ad-antifraud-next
yarn add ad-antifraud-next
pnpm add ad-antifraud-next
```

Package page: https://www.npmjs.com/package/ad-antifraud-next

Peer dependencies: `next >= 14`, `react >= 18` (react is optional if you skip the beacon).

## Quick start

### 1. Node instance (API routes, forms)

```js
// src/lib/antifraud.js
import { createAntifraud } from 'ad-antifraud-next/node';

export const antifraud = createAntifraud({
  adLandingPaths: ['/landing', '/promo'],
});
```

### 2. Middleware (Edge, no filesystem)

```js
// src/middleware.js
import { createAntifraudMiddleware } from 'ad-antifraud-next/next/middleware';

const edge = createAntifraudMiddleware({
  adLandingPaths: ['/landing', '/promo'],
});

export const middleware = edge.middleware;

// Next.js requires a static config object
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
```

### 3. API routes

```js
// src/app/api/antifraud/log/route.js
import { antifraud } from '@/lib/antifraud';
export const { POST, PUT } = antifraud.logHandlers;
```

```js
// src/app/api/antifraud/report/route.js
import { antifraud } from '@/lib/antifraud';
export const GET = antifraud.reportHandler;
```

### 4. Client beacon

```jsx
// src/app/layout.jsx
import AntifraudBeacon from 'ad-antifraud-next/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <AntifraudBeacon />
      </body>
    </html>
  );
}
```

Disable trackers when fraud is detected:

```jsx
useEffect(() => {
  const handler = () => setBlocked(true);
  window.addEventListener('adFraudStatus', handler);
  return () => window.removeEventListener('adFraudStatus', handler);
}, []);
```

### 5. Protect forms

```js
import { antifraud } from '@/lib/antifraud';
import { getClientIp } from 'ad-antifraud-next';

if (antifraud.isIpBlocked(getClientIp(req))) {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTIFRAUD_ENABLED` | `true` | Master switch |
| `ANTIFRAUD_INTERNAL_SECRET` | - | Secret for middleware to log API calls |
| `ANTIFRAUD_ADMIN_TOKEN` | - | Bearer token for report API |
| `ANTIFRAUD_BLOCK_THRESHOLD` | `70` | Hard block score |
| `ANTIFRAUD_SOFT_THRESHOLD` | `45` | Soft block (no trackers) |

## Report API

```bash
curl -H "Authorization: Bearer $ANTIFRAUD_ADMIN_TOKEN" \
  "https://yoursite.com/api/antifraud/report?hours=168"
```

Query params:

| Param | Description |
|-------|-------------|
| `hours` | Period in hours (default 168) |
| `format=events` | Raw event list |
| `action=block` | Filter by action |
| `ip=1.2.3.4` | Filter by IP |
| `limit=300` | Max rows |

Response fields: `summary`, `topIps`, `topSources`, `recent`.

Log file on server: `data/antifraud/events.jsonl`

## Scoring signals

| Signal | Score | Description |
|--------|-------|-------------|
| `bot_ua` | 90 | Known bot or scraper User-Agent |
| `webdriver` | 100 | `navigator.webdriver === true` |
| `automation_globals` | 90 | Selenium, PhantomJS globals |
| `headless_client` | 85 | Headless Chrome heuristics |
| `datacenter_ip` | 50 | Hosting IP on ad click |
| `rate_short` | 45 | Too many visits in 5 minutes |
| `rate_long` | 65 | Too many visits in 1 hour |
| `empty_ua` | 55 | Missing User-Agent |
| `missing_sec_fetch` | 30 | Modern browser without Sec-Fetch headers |

Actions:

- `allow` - normal visit
- `soft_block` - page loads, trackers disabled
- `block` - HTTP 403

## Configuration

```js
createAntifraud({
  enabled: true,
  blockThreshold: 70,
  softBlockThreshold: 45,
  adLandingPaths: ['/landing'],
  logDir: 'data/antifraud',
  cookieName: 'ad_fraud',
  logApiPath: '/api/antifraud/log',
  reportApiPath: '/api/antifraud/report',
  fraudEventName: 'adFraudStatus',
  visitLimits: {
    short: { max: 4, windowMs: 300000 },
    long: { max: 15, windowMs: 3600000 },
  },
  blockPageHtml: '<!DOCTYPE html>...',
});
```

## Package exports

| Import | Runtime | Purpose |
|--------|---------|---------|
| `ad-antifraud-next` | Edge + Node | Core API, middleware factory |
| `ad-antifraud-next/node` | Node | Store, log/report handlers |
| `ad-antifraud-next/next/middleware` | Edge | Middleware only |
| `ad-antifraud-next/react` | Client | Beacon component |
| `ad-antifraud-next/core` | Any | Scoring without Next.js |

## Core API (no Next.js)

```js
import { scoreVisit, resolveConfig, createStore } from 'ad-antifraud-next/core';

const config = resolveConfig({ adLandingPaths: ['/promo'] });
const result = scoreVisit(config, {
  url: 'https://site.com/promo?yclid=123',
  referer: 'https://yandex.ru/',
  userAgent: 'Mozilla/5.0 ...',
  ip: '1.2.3.4',
  headers: { get: (name) => req.headers[name.toLowerCase()] },
});
```

## Important notes

- Ad platforms charge per click **before** the user lands on your site. This library reduces fake conversions, protects analytics, and collects evidence (IPs, yclid) for refund requests.
- Middleware and API routes use **separate imports** - middleware must not import the Node store (filesystem).
- Set `transpilePackages: ['ad-antifraud-next']` in `next.config.js` if the beacon JSX is not compiled.

## License

MIT - see [LICENSE](LICENSE).
