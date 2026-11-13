# ad-antifraud-next

[![npm version](https://img.shields.io/npm/v/ad-antifraud-next.svg)](https://www.npmjs.com/package/ad-antifraud-next)
[![npm downloads](https://img.shields.io/npm/dm/ad-antifraud-next.svg)](https://www.npmjs.com/package/ad-antifraud-next)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Dveyn/ad-antifraud-next.svg)](https://github.com/Dveyn/ad-antifraud-next)

Антифрод для **платного рекламного трафика** в Next.js App Router.

Блокирует ботов, пишет IP и источники (Яндекс Директ, Google Ads, VK, UTM), защищает счётчики и формы от фейковых конверсий.

**Языки:** [English](README.md) | [Русский](README.ru.md)

Работает с **npm**, **yarn** и **pnpm** (все берут пакеты из npm registry).

## Возможности

- Edge middleware - первая линия защиты, жёсткий блок (403) и залипающая cookie блока
- Client beacon - headless, автоматизация, пустое окно, расхождение UA и платформы
- Повтор click id - тот же yclid/gclid/wbraid с другого IP блокируется
- JSONL-лог - IP, yclid, ysclid, gclid, wbraid, utm, referer, user-agent, score
- Report API - топ фродовых IP и источников для обращений в поддержку рекламы
- Мягкий блок - страница открывается, но счётчики не грузятся
- Защита форм - отклонение заявок с фрод-IP

## Установка

```bash
npm install ad-antifraud-next
yarn add ad-antifraud-next
pnpm add ad-antifraud-next
```

Страница пакета: https://www.npmjs.com/package/ad-antifraud-next

Peer dependencies: `next >= 14`, `react >= 18` (react не нужен, если не используете beacon).

## Быстрый старт

### 1. Node-инстанс (API, формы)

```js
// src/lib/antifraud.js
import { createAntifraud } from 'ad-antifraud-next/node';

export const antifraud = createAntifraud({
  adLandingPaths: ['/landing', '/promo'],
});
```

### 2. Middleware (Edge, без файловой системы)

```js
// src/middleware.js
import { createAntifraudMiddleware } from 'ad-antifraud-next/next/middleware';

const edge = createAntifraudMiddleware({
  adLandingPaths: ['/landing', '/promo'],
});

export const middleware = edge.middleware;

// Next.js требует статический объект config
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

### 4. Клиентский beacon

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

Отключение счётчиков при фроде:

```jsx
useEffect(() => {
  const handler = () => setBlocked(true);
  window.addEventListener('adFraudStatus', handler);
  return () => window.removeEventListener('adFraudStatus', handler);
}, []);
```

### 5. Защита форм

```js
import { antifraud } from '@/lib/antifraud';
import { getClientIp } from 'ad-antifraud-next';

if (antifraud.isIpBlocked(getClientIp(req))) {
  return Response.json({ error: 'Запрещено' }, { status: 403 });
}
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `ANTIFRAUD_ENABLED` | `true` | Главный выключатель |
| `ANTIFRAUD_INTERNAL_SECRET` | - | Секрет для middleware -> log API |
| `ANTIFRAUD_ADMIN_TOKEN` | - | Bearer-токен для report API |
| `ANTIFRAUD_BLOCK_THRESHOLD` | `70` | Порог жёсткой блокировки |
| `ANTIFRAUD_SOFT_THRESHOLD` | `45` | Порог мягкой блокировки |

## Report API

```bash
curl -H "Authorization: Bearer $ANTIFRAUD_ADMIN_TOKEN" \
  "https://yoursite.com/api/antifraud/report?hours=168"
```

Параметры:

| Параметр | Описание |
|----------|----------|
| `hours` | Период в часах (по умолчанию 168) |
| `format=events` | Сырой список событий |
| `action=block` | Фильтр по действию |
| `ip=1.2.3.4` | Фильтр по IP |
| `limit=300` | Лимит строк |

Ответ: `summary`, `topIps`, `topSources`, `recent`.

Файл лога на сервере: `data/antifraud/events.jsonl`

## Сигналы скоринга

| Сигнал | Score | Описание |
|--------|-------|----------|
| `bot_ua` | 90 | Известный бот в User-Agent. AdsBot-Google и проверка Директа не блокируются |
| `webdriver` | 100 | `navigator.webdriver === true` |
| `automation_globals` | 90 | Selenium, PhantomJS |
| `headless_client` | 85 | Headless Chrome |
| `click_id_replay` | 80 | Тот же click id уже был с другого IP |
| `malformed_click_id` | 80 | Click id мусорный, слишком короткий или не той формы |
| `click_id_churn` | 75 | 8 и больше разных click id с одного IP за час |
| `rate_short` | 75 | Визиты на один путь уперлись в короткий лимит (по умолчанию 4 / 5 мин) |
| `rate_ip` | 70 | Тот же IP набрал двойной короткий лимит по всем путям |
| `rate_long` | 65 | Визиты на один путь уперлись в длинный лимит (по умолчанию 15 / 1 ч) |
| `empty_ua` | 80 / 55 | Нет UA или он короче 20 символов |
| `zero_window` | 55 | Браузер сообщает внешнее окно 0x0 |
| `datacenter_ip` | 50 | Известный префикс VPS/Tor на рекламном клике. Целые облачные /8 не используются |
| `ua_hint_mismatch` | 45 | ОС в UA не совпадает с client hints |
| `click_referer_mismatch` | 40 | Click id Яндекса открыт с Google, или наоборот |
| `suspicious_viewport` | 40 | Экран 0x0 или 1x1 |
| `mixed_click_ids` | 35 | Click id двух рекламных сетей в одном URL |
| `missing_sec_fetch` | 30 | Современный браузер без Sec-Fetch |
| `missing_client_hints` | 25 | Документ Chrome без `sec-ch-ua` |
| `zero_plugins` | 25 | Десктопный Chrome без плагинов. Мобильные не учитываются |
| `prior_block` | 100 | Cookie блока или серверный список IP |

Действия:

- `allow` - обычный визит
- `soft_block` - страница открыта, счётчики отключены
- `block` - HTTP 403

## Конфигурация

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
  visitCookieName: 'ad_fv',
  visitLimits: {
    short: { max: 4, windowMs: 300000 },
    long: { max: 15, windowMs: 3600000 },
  },
  blockPageHtml: '<!DOCTYPE html>...',
});
```

## Экспорты пакета

| Импорт | Runtime | Назначение |
|--------|---------|------------|
| `ad-antifraud-next` | Edge + Node | Core API, фабрика middleware |
| `ad-antifraud-next/node` | Node | Store, log/report handlers |
| `ad-antifraud-next/next/middleware` | Edge | Только middleware |
| `ad-antifraud-next/react` | Client | Beacon-компонент |
| `ad-antifraud-next/core` | Любой | Скоринг без Next.js |

## Core API (без Next.js)

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

## Важно

- Рекламные площадки списывают деньги **в момент клика**, до захода на сайт. Библиотека снижает фейковые конверсии, защищает аналитику и собирает доказательства (IP, yclid) для возврата бюджета.
- Middleware и API routes используют **разные импорты** - middleware не должен тянуть Node store (fs).
- Middleware отправляет в log API заголовки посетителя. Сам log-запрос не оценивается как визит.
- Обновление страницы с тем же click id и тем же IP не считается повтором. Повтор - это тот же click id с другого IP.
- Платные click id также включают `ysclid`, `wbraid`, `gbraid`, `ttclid` и `rb_clickid`.
- Добавьте `transpilePackages: ['ad-antifraud-next']` в `next.config.js`, если JSX beacon не компилируется.

## Лицензия

MIT - см. [LICENSE](LICENSE).
