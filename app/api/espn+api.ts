const TTL_MS = 2 * 60 * 1000; // 2 minutes
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
    // Parse the URL safely
    let requestedSport = 'nba';
    try {
      const url = new URL(req.url);
      requestedSport = url.searchParams.get('sportKey') || url.searchParams.get('sport') || 'nba';
    } catch (e) {
      console.log('[OddsAPI Route] Using default sport: nba');
    }
    
    const sportKey = SPORT_KEY_MAPPING[requestedSport.toLowerCase()] || 'basketball_nba';
    
    // Get environment variables - handle different Next.js environments
    const KEY = process.env.ODDSAPI_KEY || process.env.NEXT_PUBLIC_ODDSAPI_KEY;
    const enabled = process.env.ENABLE_ODDSAPI || process.env.NEXT_PUBLIC_ENABLE_ODDSAPI;
    
    console.log(`[OddsAPI Route] Requested: ${requestedSport}, Mapped: ${sportKey}`);
    console.log(`[OddsAPI Route] Key present: ${!!KEY}`);
    console.log(`[OddsAPI Route] Enabled: ${enabled}`);
    
    // If no API key or not enabled, return empty games array gracefully
    if (!KEY) {
      console.log(`[OddsAPI Route] No API key found, returning empty games`);
      return okJSON({ ok: true, games: [] });
    }
    
    if (enabled !== 'true' && enabled !== '1') {
      console.log(`[OddsAPI Route] OddsAPI disabled, returning empty games`);
      return okJSON({ ok: true, games: [] });
    }

    const cacheKey = `odds:${sportKey}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      console.log(`[OddsAPI Route] Cache hit: ${sportKey}`);
      return okJSON({ ok: true, games: cached.data });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.log(`[OddsAPI Route] Request timeout for ${sportKey}`);
    }, 10000);

    try {
      const fetchUrl = `${API}/${sportKey}/odds?apiKey=${KEY}&markets=totals&oddsFormat=american&regions=us`;
      
      console.log(`[OddsAPI Route] Fetching: ${fetchUrl.replace(KEY, 'REDACTED')}`);

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'SportsApp/1.0'
        }
      });
      
      clearTimeout(timeout);

      const responseText = await response.text();
      
      // Check for HTML error pages or empty responses
      if (!responseText || responseText.trim().length === 0) {
        console.error(`[OddsAPI Route] Empty response for ${sportKey}`);
        return okJSON({ 
          ok: false, 
          error: `Empty response from OddsAPI`,
          games: [] 
        });
      }
      
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.error(`[OddsAPI Route] Received HTML error page for ${sportKey}`);
        console.error(`[OddsAPI Route] Response preview:`, responseText.substring(0, 200));
        
        return okJSON({ 
          ok: false, 
          error: `OddsAPI returned HTML error page - check API key and sport key`,
          games: [] 
        });
      }
      
      let rawData;
      try {
        rawData = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[OddsAPI Route] JSON parse error:`, parseError);
        console.error(`[OddsAPI Route] Response start:`, responseText.substring(0, 300));
        return okJSON({ 
          ok: false, 
          error: `Invalid JSON response from OddsAPI`,
          games: [] 
        });
      }
      
      if (!response.ok) {
        console.error(`[OddsAPI Route] API error ${response.status}:`, rawData);
        
        // Handle common API errors
        if (response.status === 401) {
          return okJSON({ 
            ok: false, 
            error: `Invalid API key - check your OddsAPI key`,
            games: [] 
          });
        } else if (response.status === 429) {
          return okJSON({ 
            ok: false, 
            error: `Rate limit exceeded - try again later`,
            games: [] 
          });
        } else if (response.status === 400) {
          return okJSON({ 
            ok: false, 
            error: `Invalid request - sport key '${sportKey}' may not exist`,
            games: [] 
          });
        }
        
        return okJSON({ 
          ok: false, 
          error: `HTTP ${response.status}: ${rawData?.message || 'Unknown error'}`,
          games: [] 
        });
      }

      // Handle case where API returns error object instead of array
      if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
        if (rawData.message) {
          console.error(`[OddsAPI Route] API error message:`, rawData.message);
          return okJSON({ 
            ok: false, 
            error: rawData.message,
            games: [] 
          });
        }
      }

      // Process games data
      const games = (Array.isArray(rawData) ? rawData : []).map((game: any) => {
        const totals: number[] = [];
        const commenceTimeUTC: string | undefined = game?.commence_time;
        
        // Extract totals from all bookmakers
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

      console.log(`[OddsAPI Route] ✓ Processed ${games.length} games for ${sportKey}`);
      if (games.length > 0) {
        console.log(`[OddsAPI Route] Sample game: ${games[0]?.away} @ ${games[0]?.home}, Total: ${games[0]?.total}`);
      } else {
        console.log(`[OddsAPI Route] No games found for ${sportKey} - this is normal if no games are scheduled`);
      }
      
      // Cache the successful response
      cache.set(cacheKey, { ts: now, data: games });
      return okJSON({ ok: true, games });
      
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        console.error(`[OddsAPI Route] Request timeout for ${sportKey}`);
        return okJSON({ 
          ok: false, 
          error: `Request timeout after 10 seconds`,
          games: [] 
        });
      }
      throw fetchError;
    }
    
  } catch (err: any) {
    console.error(`[OddsAPI Route] Unexpected error:`, err.message || err);
    return okJSON({ 
      ok: false, 
      error: err.message || 'Unknown error occurred',
      games: [] 
    });
  }
}