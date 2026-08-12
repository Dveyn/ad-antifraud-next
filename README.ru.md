# ad-antifraud-next

Антифрод для **платного рекламного трафика** в Next.js App Router.

Блокирует ботов, пишет IP и источники (Яндекс Директ, Google Ads, VK, UTM), защищает счётчики и формы от фейковых конверсий.

**Языки:** [English](README.md) | [Русский](README.ru.md)

Работает с **npm**, **yarn** и **pnpm**.

## Возможности

- Edge middleware - первая линия защиты, жёсткий блок (403)
- Client beacon - детект headless-браузеров и автоматизации
- JSONL-лог - IP, yclid, gclid, utm, referer, user-agent, score
- Report API - топ фродовых IP и источников для обращений в поддержку рекламы
- Мягкий блок - страница открывается, но счётчики не грузятся
- Защита форм - отклонение заявок с фрод-IP

## Установка

```bash
npm install ad-antifraud-next
yarn add ad-antifraud-next
pnpm add ad-antifraud-next
```

Из GitHub (до публикации в npm):

```bash
npm install github:Dveyn/ad-antifraud-next
yarn add Dveyn/ad-antifraud-next
pnpm add github:Dveyn/ad-antifraud-next
```

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
| `bot_ua` | 90 | Известный бот в User-Agent |
| `webdriver` | 100 | `navigator.webdriver === true` |
| `automation_globals` | 90 | Selenium, PhantomJS |
| `headless_client` | 85 | Headless Chrome |
| `datacenter_ip` | 50 | IP хостинга на рекламном клике |
| `rate_short` | 45 | Много визитов за 5 минут |
| `rate_long` | 65 | Много визитов за час |
| `empty_ua` | 55 | Пустой User-Agent |
| `missing_sec_fetch` | 30 | Нет Sec-Fetch заголовков |

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
- Добавьте `transpilePackages: ['ad-antifraud-next']` в `next.config.js`, если JSX beacon не компилируется.

## Лицензия

MIT - см. [LICENSE](LICENSE).
