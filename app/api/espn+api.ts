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
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  mlb: 'baseball/mlb',
  ncaa_fb: 'football/college-football',
  ncaa_bb: 'basketball/mens-college-basketball',
  soccer: 'soccer/usa.1',
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedSport = url.searchParams.get('sport') || 'nba';
    const dates = url.searchParams.get('dates');

    const sportPath = ESPN_SPORT_PATHS[requestedSport.toLowerCase()];
    if (!sportPath) return okJSON({ ok: true, games: [] });

    const cacheKey = `espn:${requestedSport}:${dates || 'today'}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      return okJSON({ ok: true, games: cached.data });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const queryString = dates ? `?dates=${dates}` : '';
      const fetchUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard${queryString}`;

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SportsApp/1.0',
        },
      });
      clearTimeout(timeout);

      const responseText = await response.text();
      if (!responseText || responseText.trim().length === 0) {
        return okJSON({ ok: false, error: 'Empty response from ESPN', games: [] });
      }
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        return okJSON({ ok: false, error: 'ESPN returned HTML error page', games: [] });
      }

      let rawData: any;
      try {
        rawData = JSON.parse(responseText);
      } catch (parseError) {
        return okJSON({ ok: false, error: 'Invalid JSON response from ESPN', games: [] });
      }

      if (!response.ok) {
        return okJSON({ ok: false, error: `HTTP ${response.status}`, games: [] });
      }

      const events = rawData?.events || [];
      const games = events
        .map((event: any) => {
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
            status:
              event?.status?.type?.name === 'STATUS_FINAL'
                ? 'post'
                : event?.status?.type?.state === 'in'
                ? 'in'
                : 'pre',
            homeScore: homeTeam?.score,
            awayScore: awayTeam?.score,
            source: 'espn' as const,
          };
        })
        .filter((g: any) => g.home && g.away && g.commenceTimeUTC);

      cache.set(cacheKey, { ts: now, data: games });
      return okJSON({ ok: true, games });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        return okJSON({ ok: false, error: 'Request timeout after 12 seconds', games: [] });
      }
      throw fetchError;
    }
  } catch (err: any) {
    return okJSON({ ok: false, error: err.message || 'Unknown error occurred', games: [] });
  }
}
