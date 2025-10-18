const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

const API = 'https://api.the-odds-api.com/v4/sports';

function okJSON(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=120'
    },
  });
}

function median(nums: number[]) {
  if (!nums.length) return undefined;
  const arr = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1]! + arr[mid]!) / 2;
}

function std(nums: number[]) {
  if (nums.length < 2) return undefined;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  const v = nums.reduce((a, b) => a + (b - m) * (b - m), 0) / nums.length;
  return Math.sqrt(v);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sportKey = url.searchParams.get('sportKey') || url.searchParams.get('sport') || 'basketball_nba';
    
    const KEY = process.env.ODDSAPI_KEY || process.env.EXPO_PUBLIC_ODDSAPI_KEY;
    const enabled = process.env.ENABLE_ODDSAPI || process.env.EXPO_PUBLIC_ENABLE_ODDSAPI;
    
    console.log(`[OddsAPI Route] Sport: ${sportKey}`);
    console.log(`[OddsAPI Route] Key: ${KEY ? 'present' : 'MISSING'}`);
    console.log(`[OddsAPI Route] Enabled: ${enabled}`);
    
    if (!KEY) {
      console.error(`[OddsAPI Route] ERROR: API key not configured`);
      return okJSON({ ok: false, error: 'API key not configured', games: [] }, 200);
    }
    
    if (enabled !== 'true') {
      console.error(`[OddsAPI Route] ERROR: OddsAPI not enabled`);
      return okJSON({ ok: false, error: 'OddsAPI not enabled', games: [] }, 200);
    }

    const cacheKey = `odds:${sportKey}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      console.log(`[OddsAPI Route] Cache hit: ${sportKey}`);
      return okJSON({ ok: true, games: cached.data });
    }

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 7500);

    const fetchUrl = `${API}/${sportKey}/odds?apiKey=${KEY}&markets=totals&oddsFormat=american&bookmakers=all`;
    console.log(`[OddsAPI Route] Fetching: ${fetchUrl.replace(KEY, 'REDACTED')}`);

    const resp = await fetch(fetchUrl, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(to);
    
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(`Non-JSON from OddsAPI: ${resp.status}`);
    }
    
    const raw = await resp.json();

    if (!resp.ok) {
      console.error(`[OddsAPI Route] API error:`, raw);
      return okJSON({ ok: false, error: `HTTP ${resp.status}`, games: [] }, 200);
    }

    const games = (raw || []).map((g: any) => {
      const totals: number[] = [];
      const commenceTimeUTC: string | undefined = g?.commence_time;
      
      (g?.bookmakers || []).forEach((bm: any) => {
        (bm?.markets || []).forEach((m: any) => {
          (m?.outcomes || []).forEach((o: any) => {
            if (typeof o?.point === 'number') totals.push(o.point);
          });
        });
      });
      
      const mu = median(totals);
      const sd = std(totals);
      
      return {
        id: g?.id,
        home: g?.home_team,
        away: g?.away_team,
        commenceTimeUTC,
        total: mu,
        numBooks: totals.length,
        stdBooks: sd,
        source: 'oddsapi' as const,
      };
    }).filter((g: any) => g.home && g.away && g.commenceTimeUTC);

    console.log(`[OddsAPI Route] ✓ ${games.length} games`);
    if (games.length > 0) {
      console.log(`[OddsAPI Route] First game: ${games[0]?.away} @ ${games[0]?.home}`);
    }
    
    cache.set(cacheKey, { ts: now, data: games });
    return okJSON({ ok: true, games });
  } catch (err: any) {
    console.error(`[OddsAPI Route] ERROR:`, err.message || err);
    return okJSON({ ok: false, error: String(err), games: [] }, 200);
  }
}
