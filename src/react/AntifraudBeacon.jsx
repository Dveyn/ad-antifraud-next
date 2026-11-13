'use client';

import { useEffect } from 'react';

function collectClientSignals() {
  if (typeof window === 'undefined') return {};

  const nav = window.navigator;
  const win = window;

  const automation =
    Boolean(win.__webdriver_script_fn) ||
    Boolean(win._Selenium_IDE_Recorder) ||
    Boolean(win.callPhantom) ||
    Boolean(win._phantom) ||
    Boolean(win.domAutomation) ||
    Boolean(win.domAutomationController);

  const headless =
    nav.webdriver === true ||
    /HeadlessChrome/i.test(nav.userAgent) ||
    (nav.languages?.length === 0 && /Chrome/i.test(nav.userAgent));

  const brands = nav.userAgentData?.brands?.map((item) => item.brand).filter(Boolean).join(',') || '';

  return {
    webdriver: nav.webdriver === true,
    headless,
    automation,
    zeroPlugins: nav.plugins?.length === 0,
    screen: `${window.screen?.width}x${window.screen?.height}`,
    outerEmpty: window.outerWidth === 0 && window.outerHeight === 0,
    platform: nav.platform || nav.userAgentData?.platform || '',
    mobileHint: typeof nav.userAgentData?.mobile === 'boolean' ? nav.userAgentData.mobile : undefined,
    brands,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * @param {Object} props
 * @param {string} [props.logUrl='/api/antifraud/log']
 * @param {string} [props.cookieName='ad_fraud']
 * @param {string} [props.fraudEventName='adFraudStatus']
 */
export default function AntifraudBeacon({
  logUrl = '/api/antifraud/log',
  cookieName = 'ad_fraud',
  fraudEventName = 'adFraudStatus',
}) {
  useEffect(() => {
    function publishFraudStatus(action, score) {
      window.__adFraudBlocked = action;
      window.__adFraudScore = score;
      window.dispatchEvent(
        new CustomEvent(fraudEventName, { detail: { action, score } }),
      );
    }

    function readFraudCookie() {
      try {
        const re = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`);
        const match = document.cookie.match(re);
        return match ? decodeURIComponent(match[1]) : null;
      } catch {
        return null;
      }
    }

    const cookieAction = readFraudCookie();
    if (cookieAction === 'block' || cookieAction === 'soft_block') {
      publishFraudStatus(cookieAction, cookieAction === 'block' ? 100 : 60);
      return;
    }

    const payload = {
      url: window.location.href,
      referer: document.referrer || null,
      userAgent: navigator.userAgent,
      clientSignals: collectClientSignals(),
    };

    fetch(logUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.action) return;
        if (data.action === 'block' || data.action === 'soft_block') {
          document.cookie = `${cookieName}=${data.action}; path=/; max-age=86400; samesite=lax`;
          publishFraudStatus(data.action, data.score);
        }
      })
      .catch(() => {});
  }, [logUrl, cookieName, fraudEventName]);

  return null;
}

export { AntifraudBeacon };
