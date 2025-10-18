const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

const API_BASE = 'https://api.the-odds-api.com/v4/sports';

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
    const sportKey = url.searchParams.get('sportKey') || 'basketball_nba';
    
    const KEY = process.env.ODDSAPI_KEY || process.env.EXPO_PUBLIC_ODDSAPI_KEY;
    const enabled = process.env.ENABLE_ODDSAPI || process.env.EXPO_PUBLIC_ENABLE_ODDSAPI;
    
    console.log(`[OddsAPI] Sport: ${sportKey}`);
    console.log(`[OddsAPI] Key: ${KEY ? 'present' : 'MISSING'}`);
    console.log(`[OddsAPI] Enabled: ${enabled}`);
    
    if (!KEY || enabled !== 'true') {
      console.log(`[OddsAPI] Disabled or no key, returning empty games`);
      return okJSON({ ok: true, games: [] });
    }

    const cacheKey = `odds:${sportKey}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      console.log(`[OddsAPI] Cache hit: ${sportKey}`);
      return okJSON({ ok: true, games: cached.data });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.log(`[OddsAPI] Timeout for ${sportKey}`);
    }, 10000);

    try {
      const fetchUrl = `${API_BASE}/${sportKey}/odds?apiKey=${KEY}&markets=totals&oddsFormat=american&regions=us`;
      
      console.log(`[OddsAPI] Fetching: ${fetchUrl.replace(KEY, 'REDACTED')}`);

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'SportsApp/1.0'
        }
      });
      
      clearTimeout(timeout);

      const responseText = await response.text();
      
      if (!responseText || responseText.trim().length === 0) {
        console.error(`[OddsAPI] Empty response for ${sportKey}`);
        return okJSON({ 
          ok: false, 
          error: `Empty response`,
          games: [] 
        });
      }
      
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.error(`[OddsAPI] HTML error page for ${sportKey}`);
        console.error(`[OddsAPI] Preview:`, responseText.substring(0, 200));
        
        return okJSON({ 
          ok: false, 
          error: `HTML error page - check API key`,
          games: [] 
        });
      }
      
      let rawData;
      try {
        rawData = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[OddsAPI] JSON parse error:`, parseError);
        console.error(`[OddsAPI] Response:`, responseText.substring(0, 300));
        return okJSON({ 
          ok: false, 
          error: `Invalid JSON`,
          games: [] 
        });
      }
      
      if (!response.ok) {
        console.error(`[OddsAPI] Error ${response.status}:`, rawData);
        
        if (response.status === 401) {
          return okJSON({ 
            ok: false, 
            error: `Invalid API key`,
            games: [] 
          });
        } else if (response.status === 429) {
          return okJSON({ 
            ok: false, 
            error: `Rate limit exceeded`,
            games: [] 
          });
        } else if (response.status === 400) {
          return okJSON({ 
            ok: false, 
            error: `Invalid sport key: ${sportKey}`,
            games: [] 
          });
        }
        
        return okJSON({ 
          ok: false, 
          error: `HTTP ${response.status}`,
          games: [] 
        });
      }

      if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
        if (rawData.message) {
          console.error(`[OddsAPI] Error message:`, rawData.message);
          return okJSON({ 
            ok: false, 
            error: rawData.message,
            games: [] 
          });
        }
      }

      const games = (Array.isArray(rawData) ? rawData : []).map((game: any) => {
        const totals: number[] = [];
        const commenceTimeUTC: string | undefined = game?.commence_time;
        
        (game?.bookmakers || []).forEach((bookmaker: any) => {
          (bookmaker?.markets || []).forEach((market: any) => {
            if (market.key === 'totals') {
              (market?.outcomes || []).forEach((outcome: any) => {
                if (typeof outcome?.point === 'number') {
                  totals.push(outcome.point);
                }
              });
            }
          });
        });
        
        const medianTotal = median(totals);
        const standardDeviation = std(totals);
        
        return {
          id: game?.id,
          home: game?.home_team,
          away: game?.away_team,
          commenceTimeUTC,
          total: medianTotal,
          numBooks: totals.length,
          stdBooks: standardDeviation,
          source: 'oddsapi' as const,
        };
      }).filter((game: any) => 
        game.home && 
        game.away && 
        game.commenceTimeUTC
      );

      console.log(`[OddsAPI] ✓ ${games.length} games for ${sportKey}`);
      if (games.length > 0) {
        console.log(`[OddsAPI] Sample: ${games[0]?.away} @ ${games[0]?.home}, Total: ${games[0]?.total}`);
      }
      
      cache.set(cacheKey, { ts: now, data: games });
      return okJSON({ ok: true, games });
      
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        console.error(`[OddsAPI] Timeout for ${sportKey}`);
        return okJSON({ 
          ok: false, 
          error: `Request timeout`,
          games: [] 
        });
      }
      throw fetchError;
    }
    
  } catch (err: any) {
    console.error(`[OddsAPI] Error:`, err.message || err);
    return okJSON({ 
      ok: false, 
      error: err.message || 'Unknown error',
      games: [] 
    });
  }
}
