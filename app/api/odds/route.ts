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

const SPORT_KEY_MAPPING: Record<string, string> = {
  'nfl': 'americanfootball_nfl',
  'nba': 'basketball_nba', 
  'nhl': 'icehockey_nhl',
  'mlb': 'baseball_mlb',
  'ncaa_fb': 'americanfootball_ncaaf',
  'ncaa_bb': 'basketball_ncaab',
  'soccer': 'soccer_epl',
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedSport = url.searchParams.get('sportKey') || url.searchParams.get('sport') || 'nba';
    
    const sportKey = SPORT_KEY_MAPPING[requestedSport.toLowerCase()] || 'basketball_nba';
    
    const KEY = process.env.ODDSAPI_KEY || process.env.EXPO_PUBLIC_ODDSAPI_KEY;
    const enabled = process.env.ENABLE_ODDSAPI || process.env.EXPO_PUBLIC_ENABLE_ODDSAPI;
    
    console.log(`[OddsAPI Route] Requested: ${requestedSport}, Mapped: ${sportKey}`);
    console.log(`[OddsAPI Route] Key: ${KEY ? 'present' : 'MISSING'}`);
    console.log(`[OddsAPI Route] Enabled: ${enabled}`);
    
    if (!KEY || enabled !== 'true') {
      console.log(`[OddsAPI Route] OddsAPI disabled or no key, returning empty games`);
      return okJSON({ ok: true, games: [] });
    }

    const cacheKey = `odds:${sportKey}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      console.log(`[OddsAPI Route] Cache hit: ${sportKey}`);
      return okJSON({ ok: true, games: cached.data });
    }

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);

    const fetchUrl = `${API}/${sportKey}/odds?apiKey=${KEY}&markets=totals&oddsFormat=american&bookmakers=betmgm,fanduel,draftkings,pointsbet&regions=us`;
    
    console.log(`[OddsAPI Route] Fetching: ${fetchUrl.replace(KEY, 'REDACTED')}`);

    const resp = await fetch(fetchUrl, {
      signal: ctrl.signal,
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'SportsApp/1.0'
      }
    });
    clearTimeout(to);
    
    const text = await resp.text();
    
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.error(`[OddsAPI Route] Received HTML error page for ${sportKey}`);
      console.error(`[OddsAPI Route] First 200 chars:`, text.substring(0, 200));
      
      return okJSON({ 
        ok: false, 
        error: `OddsAPI returned HTML error page for ${sportKey}`,
        games: [] 
      });
    }
    
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (parseError) {
      console.error(`[OddsAPI Route] JSON parse error:`, parseError);
      console.error(`[OddsAPI Route] Response text:`, text.substring(0, 500));
      return okJSON({ 
        ok: false, 
        error: `Invalid JSON response from OddsAPI`,
        games: [] 
      });
    }
    
    if (!resp.ok) {
      console.error(`[OddsAPI Route] API error ${resp.status}:`, raw);
      return okJSON({ 
        ok: false, 
        error: `HTTP ${resp.status}: ${raw?.message || 'Unknown error'}`,
        games: [] 
      });
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (raw.message) {
        console.error(`[OddsAPI Route] API error message:`, raw.message);
        return okJSON({ 
          ok: false, 
          error: raw.message,
          games: [] 
        });
      }
    }

    const games = (Array.isArray(raw) ? raw : []).map((g: any) => {
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

    console.log(`[OddsAPI Route] ✓ ${games.length} games for ${sportKey}`);
    if (games.length > 0) {
      console.log(`[OddsAPI Route] Sample: ${games[0]?.away} @ ${games[0]?.home}`);
    }
    
    cache.set(cacheKey, { ts: now, data: games });
    return okJSON({ ok: true, games });
  } catch (err: any) {
    console.error(`[OddsAPI Route] ERROR:`, err.message || err);
    return okJSON({ 
      ok: false, 
      error: err.message || 'Unknown error',
      games: [] 
    });
  }
}
