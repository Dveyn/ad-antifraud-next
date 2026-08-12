import fs from 'fs';
import path from 'path';
import { formatSourceLabel } from './adSource.js';

/**
 * @param {import('./types.js').AntifraudConfig} config
 */
export function createStore(config) {
  const visitStore = new Map();

  function resolveLogDir() {
    return path.isAbsolute(config.logDir)
      ? config.logDir
      : path.join(process.cwd(), config.logDir);
  }

  function ensureLogDir() {
    const dir = resolveLogDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  function logPath() {
    return path.join(ensureLogDir(), config.logFile);
  }

  function trimLogFile() {
    const file = logPath();
    if (!fs.existsSync(file)) return;
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      if (lines.length <= config.maxLogLines) return;
      const trimmed = lines.slice(lines.length - config.maxLogLines);
      fs.writeFileSync(file, `${trimmed.join('\n')}\n`, 'utf8');
    } catch {
      // ignore rotation errors
    }
  }

  function appendEvent(event) {
    const row = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      ...event,
    };

    try {
      fs.appendFileSync(logPath(), `${JSON.stringify(row)}\n`, 'utf8');
      trimLogFile();
    } catch (err) {
      console.error('[ad-antifraud] log write failed:', err.message);
    }

    return row;
  }

  function cleanupVisits(entries, windowMs) {
    const cutoff = Date.now() - windowMs;
    return entries.filter((ts) => ts > cutoff);
  }

  function trackVisit(ip, pathname) {
    const key = `${ip}:${pathname}`;
    const now = Date.now();
    let entries = visitStore.get(key) || [];
    entries.push(now);

    const short = cleanupVisits(entries, config.visitLimits.short.windowMs);
    const long = cleanupVisits(entries, config.visitLimits.long.windowMs);
    visitStore.set(key, long);

    return {
      short: short.length,
      long: long.length,
    };
  }

  function isIpBlocked(ip) {
    const key = `block:${ip}`;
    const until = visitStore.get(key);
    if (!until) return false;
    if (Date.now() > until) {
      visitStore.delete(key);
      return false;
    }
    return true;
  }

  function blockIp(ip, durationMs = config.blockIpDurationMs) {
    visitStore.set(`block:${ip}`, Date.now() + durationMs);
  }

  function readEvents({ limit = 500, action, ip, sinceHours = 168 } = {}) {
    const file = logPath();
    if (!fs.existsSync(file)) return [];

    const since = Date.now() - sinceHours * 60 * 60 * 1000;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const parsed = [];

    for (let i = lines.length - 1; i >= 0 && parsed.length < limit * 3; i--) {
      try {
        const row = JSON.parse(lines[i]);
        if (sinceHours && new Date(row.ts).getTime() < since) continue;
        if (action && row.action !== action) continue;
        if (ip && row.ip !== ip) continue;
        parsed.push(row);
      } catch {
        // skip bad lines
      }
    }

    return parsed.slice(0, limit);
  }

  function buildReport({ sinceHours = 168, limit = 300 } = {}) {
    const events = readEvents({ limit: 5000, sinceHours });

    const byIp = new Map();
    const bySource = new Map();
    let blocked = 0;
    let softBlocked = 0;
    let flagged = 0;

    for (const ev of events) {
      if (ev.action === 'block') blocked++;
      else if (ev.action === 'soft_block') softBlocked++;
      else if (ev.score >= 30) flagged++;

      const ipKey = ev.ip || 'unknown';
      if (!byIp.has(ipKey)) {
        byIp.set(ipKey, {
          ip: ipKey,
          count: 0,
          blocked: 0,
          maxScore: 0,
          sources: new Set(),
          paths: new Set(),
          lastSeen: ev.ts,
          userAgents: new Set(),
        });
      }
      const ipRow = byIp.get(ipKey);
      ipRow.count++;
      if (ev.action === 'block') ipRow.blocked++;
      ipRow.maxScore = Math.max(ipRow.maxScore, ev.score || 0);
      if (ev.sourceLabel) ipRow.sources.add(ev.sourceLabel);
      if (ev.path) ipRow.paths.add(ev.path);
      if (ev.userAgent) ipRow.userAgents.add(ev.userAgent.slice(0, 100));

      const srcKey = ev.sourceLabel || 'unknown';
      if (!bySource.has(srcKey)) {
        bySource.set(srcKey, {
          source: srcKey,
          channel: ev.channel,
          count: 0,
          blocked: 0,
          ips: new Set(),
        });
      }
      const srcRow = bySource.get(srcKey);
      srcRow.count++;
      if (ev.action === 'block') srcRow.blocked++;
      srcRow.ips.add(ipKey);
    }

    const topIps = [...byIp.values()]
      .sort((a, b) => b.maxScore - a.maxScore || b.count - a.count)
      .slice(0, limit)
      .map((row) => ({
        ip: row.ip,
        visits: row.count,
        blocked: row.blocked,
        maxScore: row.maxScore,
        sources: [...row.sources],
        paths: [...row.paths],
        lastSeen: row.lastSeen,
        userAgents: [...row.userAgents].slice(0, 3),
      }));

    const topSources = [...bySource.values()]
      .sort((a, b) => b.blocked - a.blocked || b.count - a.count)
      .slice(0, 50)
      .map((row) => ({
        source: row.source,
        channel: row.channel,
        visits: row.count,
        blocked: row.blocked,
        uniqueIps: row.ips.size,
      }));

    const recent = events.slice(0, 100).map((ev) => ({
      ts: ev.ts,
      ip: ev.ip,
      action: ev.action,
      score: ev.score,
      path: ev.path,
      sourceLabel: ev.sourceLabel,
      channel: ev.channel,
      signals: ev.signals?.map((s) => s.code) || [],
      userAgent: ev.userAgent?.slice(0, 120),
      yclid: ev.yclid,
      gclid: ev.gclid,
      utm_source: ev.utm_source,
      utm_campaign: ev.utm_campaign,
      refererHost: ev.refererHost,
    }));

    return {
      generatedAt: new Date().toISOString(),
      periodHours: sinceHours,
      summary: {
        totalEvents: events.length,
        blocked,
        softBlocked,
        flagged,
        uniqueIps: byIp.size,
        uniqueSources: bySource.size,
      },
      topIps,
      topSources,
      recent,
    };
  }

  function eventFromScoreResult({ ip, userAgent, url, referer, result, layer }) {
    const { score, action, signals, source } = result;
    return {
      ip,
      userAgent: userAgent?.slice(0, 300),
      path: source.path,
      referer: source.referer,
      refererHost: source.refererHost,
      channel: source.channel,
      sourceLabel: formatSourceLabel(source),
      yclid: source.yclid || null,
      gclid: source.gclid || null,
      utm_source: source.utm_source || null,
      utm_medium: source.utm_medium || null,
      utm_campaign: source.utm_campaign || null,
      utm_content: source.utm_content || null,
      utm_term: source.utm_term || null,
      score,
      action,
      signals,
      layer,
      url: url?.slice(0, 500),
    };
  }

  return {
    appendEvent,
    trackVisit,
    isIpBlocked,
    blockIp,
    readEvents,
    buildReport,
    eventFromScoreResult,
  };
}
