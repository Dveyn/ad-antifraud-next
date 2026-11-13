export function platformContradicts(userAgent, platform) {
  const hint = String(platform || '').toLowerCase().replace(/"/g, '');
  if (!hint) return false;

  const ua = userAgent || '';
  const uaAndroid = /Android/i.test(ua);
  const uaIos = /iPhone|iPad/i.test(ua);
  const uaWindows = /Windows NT/i.test(ua);
  const uaMac = /Macintosh|Mac OS X/i.test(ua);
  const hintAndroid = hint.includes('android');
  const hintIos = hint.includes('ios') || hint.includes('iphone') || hint.includes('ipad');
  const hintWindows = hint.includes('win');
  const hintMac = hint.includes('mac');
  const hintLinux = hint.includes('linux') || hint.includes('cros') || hint.includes('chrome os');

  if (uaAndroid && (hintWindows || hintMac || hintIos)) return true;
  if (uaIos && (hintWindows || hintAndroid || hintLinux)) return true;
  if (uaWindows && (hintAndroid || hintIos || hintMac || hintLinux)) return true;
  if (uaMac && !uaIos && (hintWindows || hintAndroid || hintIos)) return true;
  return false;
}

export function headerSignals(userAgent, headers) {
  const signals = [];
  const dest = headers.get('sec-fetch-dest');
  const mode = headers.get('sec-fetch-mode');
  const isDocument = dest === 'document' || mode === 'navigate';
  const chrome = /(?:Chrome|Edg)\/(\d+)/.exec(userAgent || '');
  const major = chrome ? Number(chrome[1]) : 0;

  if (isDocument && major >= 89 && !headers.get('sec-ch-ua') && !/AdsBot/i.test(userAgent || '')) {
    signals.push({
      code: 'missing_client_hints',
      score: 25,
      detail: 'Chrome document without sec-ch-ua',
    });
  }

  const platform = headers.get('sec-ch-ua-platform');
  if (platform && platformContradicts(userAgent, platform)) {
    signals.push({ code: 'ua_hint_mismatch', score: 45, detail: platform.slice(0, 40) });
  }

  return signals;
}
