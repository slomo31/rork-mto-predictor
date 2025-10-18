const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

const SPORT_MAPPING: Record<string, string> = {
  'nba': 'basketball/nba',
  'nfl': 'football/nfl', 
  'nhl': 'hockey/nhl',
  'mlb': 'baseball/mlb',
  'ncaa_bb': 'basketball/mens-college-basketball',
  'ncaa_fb': 'football/college-football',
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedSport = url.searchParams.get('sport') || 'nba';
    const dates = url.searchParams.get('dates');
    
    const sportPath = SPORT_MAPPING[requestedSport.toLowerCase()];
    if (!sportPath) {
      return Response.json({ ok: true, games: [] });
    }

    const cacheKey = `espn:${requestedSport}:${dates || 'today'}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      console.log(`[ESPN] Cache hit: ${cacheKey}`);
      return Response.json({ ok: true, games: cached.data });
    }

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);

    const qs = dates ? `?dates=${dates}` : '';
    const fetchUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard${qs}`;
    console.log(`[ESPN] Fetching: ${fetchUrl}`);

    const resp = await fetch(fetchUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'SportsApp/1.0',
        'Accept': 'application/json'
      }
    });
    clearTimeout(to);
    
    const text = await resp.text();
    
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.error(`[ESPN] Received HTML error page for ${requestedSport}`);
      console.error(`[ESPN] First 200 chars:`, text.substring(0, 200));
      return Response.json({ 
        ok: false, 
        error: `ESPN returned HTML error page`,
        games: [] 
      });
    }
    
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (parseError) {
      console.error(`[ESPN] JSON parse error:`, parseError);
      console.error(`[ESPN] Response text:`, text.substring(0, 500));
      return Response.json({ 
        ok: false, 
        error: `Invalid JSON from ESPN`,
        games: [] 
      });
    }

    const games = (raw?.events || []).map((event: any) => {
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
        source: 'espn' as const,
      };
    }).filter((g: any) => g.home && g.away && g.commenceTimeUTC);

    console.log(`[ESPN] ✓ ${games.length} games for ${requestedSport}`);
    if (games.length > 0) {
      console.log(`[ESPN] Sample: ${games[0]?.away} @ ${games[0]?.home}`);
    }
    
    cache.set(cacheKey, { ts: now, data: games });
    return Response.json({ ok: true, games });
  } catch (err: any) {
    console.error(`[ESPN] ERROR:`, err.message);
    return Response.json({ 
      ok: false, 
      error: err.message,
      games: [] 
    });
  }
}
