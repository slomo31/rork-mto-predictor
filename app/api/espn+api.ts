export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

function okJSON(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=120'
    },
  });
}

const ESPN_SPORT_PATHS: Record<string, string> = {
  'nfl': 'football/nfl',
  'nba': 'basketball/nba', 
  'nhl': 'hockey/nhl',
  'mlb': 'baseball/mlb',
  'ncaa_fb': 'football/college-football',
  'ncaa_bb': 'basketball/mens-college-basketball',
  'soccer': 'soccer/usa.1',
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedSport = url.searchParams.get('sport') || 'nba';
    const dates = url.searchParams.get('dates');
    
    console.log(`\n[ESPN Route] ===== Request Start =====`);
    console.log(`[ESPN Route] Requested sport: ${requestedSport}`);
    console.log(`[ESPN Route] Dates: ${dates || 'none'}`);
    console.log(`[ESPN Route] Request URL: ${req.url}`);
    
    const sportPath = ESPN_SPORT_PATHS[requestedSport.toLowerCase()];
    
    if (!sportPath) {
      console.log(`[ESPN Route] Unknown sport: ${requestedSport}`);
      return okJSON({ ok: true, games: [] });
    }
    
    console.log(`[ESPN Route] Sport path: ${sportPath}`);


    const cacheKey = `espn:${requestedSport}:${dates || 'today'}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      console.log(`[ESPN] Cache hit: ${cacheKey}`);
      return okJSON({ ok: true, games: cached.data });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.log(`[ESPN] Request timeout for ${requestedSport}`);
    }, 12000);

    try {
      const queryString = dates ? `?dates=${dates}` : '';
      const fetchUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard${queryString}`;
      
      console.log(`[ESPN] Fetching: ${fetchUrl}`);

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
        console.error(`[ESPN] Empty response for ${requestedSport}`);
        return okJSON({ 
          ok: false, 
          error: `Empty response from ESPN`,
          games: [] 
        });
      }
      
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.error(`[ESPN] Received HTML error page for ${requestedSport}`);
        console.error(`[ESPN] Response preview:`, responseText.substring(0, 200));
        
        return okJSON({ 
          ok: false, 
          error: `ESPN returned HTML error page`,
          games: [] 
        });
      }
      
      let rawData;
      try {
        rawData = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[ESPN] JSON parse error:`, parseError);
        console.error(`[ESPN] Response start:`, responseText.substring(0, 300));
        return okJSON({ 
          ok: false, 
          error: `Invalid JSON response from ESPN`,
          games: [] 
        });
      }
      
      if (!response.ok) {
        console.error(`[ESPN] API error ${response.status}:`, rawData);
        return okJSON({ 
          ok: false, 
          error: `HTTP ${response.status}`,
          games: [] 
        });
      }

      const events = rawData?.events || [];
      const games = events.map((event: any) => {
        const competition = event?.competitions?.[0];
        const homeTeam = competition?.competitors?.find((c: any) => c.homeAway === 'home');
        const awayTeam = competition?.competitors?.find((c: any) => c.homeAway === 'away');
        
        return {
          id: event?.id,
          home: homeTeam?.team?.displayName,
          away: awayTeam?.team?.displayName,
          homeId: homeTeam?.team?.id,
          awayId: awayTeam?.team?.id,
          homeLogo: homeTeam?.team?.logo,
          awayLogo: awayTeam?.team?.logo,
          venue: competition?.venue?.fullName,
          commenceTimeUTC: event?.date,
          total: competition?.odds?.[0]?.overUnder,
          status: event?.status?.type?.name === 'STATUS_FINAL' ? 'post' : event?.status?.type?.state === 'in' ? 'in' : 'pre',
          homeScore: homeTeam?.score,
          awayScore: awayTeam?.score,
          source: 'espn' as const,
        };
      }).filter((game: any) => game.home && game.away && game.commenceTimeUTC);

      console.log(`[ESPN] ✓ Processed ${games.length} games for ${requestedSport}`);
      if (games.length > 0) {
        console.log(`[ESPN] Sample game: ${games[0]?.away} @ ${games[0]?.home}`);
      }
      
      cache.set(cacheKey, { ts: now, data: games });
      return okJSON({ ok: true, games });
      
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        console.error(`[ESPN] Request timeout for ${requestedSport}`);
        return okJSON({ 
          ok: false, 
          error: `Request timeout after 12 seconds`,
          games: [] 
        });
      }
      throw fetchError;
    }
    
  } catch (err: any) {
    console.error(`[ESPN] Unexpected error:`, err.message || err);
    return okJSON({ 
      ok: false, 
      error: err.message || 'Unknown error occurred',
      games: [] 
    });
  }
}