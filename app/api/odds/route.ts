const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

function okJSON(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=60'
    },
  });
}

async function fetchWithRetry(url: string, tries = 2) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const r = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
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
      if (e.name !== 'AbortError') {
        await new Promise(res => setTimeout(res, 300 * (i + 1)));
      }
    }
  }
  throw lastErr || new Error('OddsAPI failed');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get('sport');
    const regions = searchParams.get('regions') || 'us';
    const markets = searchParams.get('markets') || 'totals';
    const dateFormat = searchParams.get('dateFormat') || 'iso';

    if (!sport) return okJSON({ error: 'Missing sport param' }, 400);
    
    const key = process.env.ODDSAPI_KEY || process.env.EXPO_PUBLIC_ODDSAPI_KEY;
    const enabled = process.env.ENABLE_ODDSAPI || process.env.EXPO_PUBLIC_ENABLE_ODDSAPI;
    
    console.log(`[OddsAPI Route] Request for sport=${sport}`);
    console.log(`[OddsAPI Route] Key: ${key ? 'present' : 'missing'}`);
    console.log(`[OddsAPI Route] Enabled: ${enabled}`);
    console.log(`[OddsAPI Route] All env vars:`, Object.keys(process.env).filter(k => k.includes('ODDS') || k.includes('ENABLE')));
    
    if (!key) {
      console.log(`[OddsAPI Route] Missing API key, returning empty`);
      return okJSON({ source: 'none', games: [], error: 'API key not configured' });
    }
    
    if (enabled !== 'true') {
      console.log(`[OddsAPI Route] OddsAPI not enabled (${enabled}), returning empty`);
      return okJSON({ source: 'none', games: [], error: 'OddsAPI not enabled' });
    }

    const ck = `odds:${sport}:${regions}:${markets}:${dateFormat}`;
    const now = Date.now();
    const cached = cache.get(ck);
    if (cached && now - cached.ts < TTL_MS) {
      console.log(`[OddsAPI Route] Cache hit for ${sport}: ${cached.data.length} games`);
      return okJSON({ source: 'cache', games: cached.data });
    }

    const url =
      `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds` +
      `?regions=${encodeURIComponent(regions)}` +
      `&markets=${encodeURIComponent(markets)}` +
      `&dateFormat=${encodeURIComponent(dateFormat)}` +
      `&apiKey=${encodeURIComponent(key)}`;

    console.log(`[OddsAPI Route] Fetching: ${url.replace(key, 'REDACTED')}`);
    const rawData = await fetchWithRetry(url, 2);
    const fixtures = Array.isArray(rawData) ? rawData : [];
    console.log(`[OddsAPI Route] Received ${fixtures.length} fixtures`);
    
    const games = fixtures.map((f: any) => {
      const totals: number[] = [];
      for (const bk of f.bookmakers || []) {
        for (const m of bk.markets || []) {
          if (m.key !== 'totals') continue;
          for (const o of m.outcomes || []) {
            if (typeof o.point === 'number') totals.push(o.point);
          }
        }
      }
      
      let total: number | undefined;
      if (totals.length > 0) {
        totals.sort((a, b) => a - b);
        const mid = Math.floor(totals.length / 2);
        total = totals.length % 2 ? totals[mid] : (totals[mid - 1]! + totals[mid]!) / 2;
      }
      
      const mean = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
      const std = totals.length > 1
        ? Math.sqrt(totals.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / (totals.length - 1))
        : 0;
      
      return {
        id: f.id,
        home: f.home_team,
        away: f.away_team,
        commenceTimeUTC: f.commence_time,
        total,
        numBooks: new Set((f.bookmakers || []).map((b: any) => b.key)).size,
        booksStd: std,
        source: 'oddsapi' as const,
      };
    });
    
    console.log(`[OddsAPI Route] Processed ${games.length} games`);
    if (games.length > 0) {
      console.log(`[OddsAPI Route] First game: ${games[0]?.away} @ ${games[0]?.home} at ${games[0]?.commenceTimeUTC}`);
    }
    
    cache.set(ck, { ts: now, data: games });
    return okJSON({ source: 'oddsapi', games });
  } catch (err: any) {
    console.error(`[OddsAPI Route] Error:`, err);
    return okJSON({ source: 'none', games: [], error: 'OddsAPI proxy failed', detail: err.message || String(err) }, 200);
  }
}
