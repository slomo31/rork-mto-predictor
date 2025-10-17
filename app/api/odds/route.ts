const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

function okJSON(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function fetchWithRetry(url: string, tries = 2) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const text = await r.text();
      const json = (() => { 
        try { 
          return JSON.parse(text); 
        } catch { 
          return { error: 'Non-JSON', bodySnippet: text.slice(0, 200) }; 
        }
      })();
      if (r.ok) return json;
      lastErr = json;
    } catch (e: any) {
      lastErr = { error: e.message || 'network error' };
    }
    await new Promise(res => setTimeout(res, 350));
  }
  throw lastErr || new Error('OddsAPI failed');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get('sport');
    const regions = searchParams.get('regions') || 'us';
    const markets = searchParams.get('markets') || 'totals,alternate_totals';
    const dateFormat = searchParams.get('dateFormat') || 'iso';

    if (!sport) return okJSON({ error: 'Missing sport param' }, 400);
    const key = process.env.ODDSAPI_KEY;
    const enabled = process.env.ENABLE_ODDSAPI;
    
    if (!key || enabled !== 'true') {
      return okJSON({ source: 'none', data: [] });
    }

    const ck = `odds:${sport}:${regions}:${markets}:${dateFormat}`;
    const now = Date.now();
    const cached = cache.get(ck);
    if (cached && now - cached.ts < TTL_MS) {
      return okJSON({ source: 'cache', data: cached.data });
    }

    const url =
      `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds` +
      `?regions=${encodeURIComponent(regions)}` +
      `&markets=${encodeURIComponent(markets)}` +
      `&dateFormat=${encodeURIComponent(dateFormat)}` +
      `&apiKey=${encodeURIComponent(key)}`;

    const data = await fetchWithRetry(url, 2);
    cache.set(ck, { ts: now, data });
    return okJSON({ source: 'oddsapi', data });
  } catch (err: any) {
    return okJSON({ source: 'none', data: [], error: 'OddsAPI proxy failed', detail: err }, 200);
  }
}
