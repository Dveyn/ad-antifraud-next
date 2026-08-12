import { NextResponse } from 'next/server';

/**
 * @param {import('../../core/types.js').AntifraudConfig} config
 * @param {ReturnType<import('../../core/store.js').createStore>} store
 */
export function createReportHandler(config, store) {
  function checkAuth(req) {
    const header = req.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : req.headers.get('x-antifraud-token');
    return config.adminToken && token === config.adminToken;
  }

  return async function GET(req) {
    if (!checkAuth(req)) {
      return NextResponse.json(
        {
          error: 'Unauthorized. Set Authorization: Bearer <ANTIFRAUD_ADMIN_TOKEN>',
        },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'report';
    const sinceHours = Number(searchParams.get('hours') || 168);
    const ip = searchParams.get('ip');
    const action = searchParams.get('action');
    const limit = Number(searchParams.get('limit') || 300);

    if (format === 'events') {
      const events = store.readEvents({ limit, ip, action, sinceHours });
      return NextResponse.json({ events, count: events.length });
    }

    const report = store.buildReport({ sinceHours, limit });
    return NextResponse.json(report);
  };
}

export { createReportHandler as default };
