export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 2 * 60 * 1000;
type Cached = { ts: number; data: any };
const cache = new Map<string, Cached>();

function okJSON(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=120',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
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
    const requestedSport = String(url.searchParams.get('sport') || 'nba').toLowerCase();
    const dates = url.searchParams.get('dates') || '';

    const sportPath = ESPN_SPORT_PATHS[requestedSport];
    if (!sportPath) return okJSON({ ok: true, games: [] });

    const cacheKey = `espn:${requestedSport}:${dates || 'today'}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      return okJSON({ ok: true, games: cached.data });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const query = dates ? `?dates=${encodeURIComponent(dates)}` : '';
      const fetchUrl = `https://site.web.api.espn.com/apis/v2/sports/${sportPath}/scoreboard${query}`;

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://www.espn.com/',
          'Accept-Language': 'en-US,en;q=0.9',
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache',
        },
      });
      clearTimeout(timeout);

      const txt = await response.text();

      if (!txt || txt.trim().length === 0) {
        return okJSON({ ok: false, error: 'Empty response from ESPN', games: [] });
      }
      if (txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) {
        return okJSON({ ok: false, error: 'ESPN returned HTML error page', games: [] });
      }

      let raw: any;
      try {
        raw = JSON.parse(txt);
      } catch {
        return okJSON({ ok: false, error: 'Invalid JSON response from ESPN', games: [] });
      }

      if (!response.ok) {
        return okJSON({ ok: false, error: `HTTP ${response.status}`, games: [] });
      }

      const events: any[] = Array.isArray(raw?.events) ? raw.events : [];
      const games = events
        .map((event) => {
          const comp = event?.competitions?.[0];
          const home = comp?.competitors?.find((c: any) => c?.homeAway === 'home');
          const away = comp?.competitors?.find((c: any) => c?.homeAway === 'away');

          return {
            id: event?.id,
            home: home?.team?.displayName,
            away: away?.team?.displayName,
            homeId: home?.team?.id,
            awayId: away?.team?.id,
            homeLogo: home?.team?.logo,
            awayLogo: away?.team?.logo,
            venue: comp?.venue?.fullName,
            commenceTimeUTC: event?.date,
            total: comp?.odds?.[0]?.overUnder,
            status:
              event?.status?.type?.name === 'STATUS_FINAL'
                ? 'post'
                : event?.status?.type?.state === 'in'
                ? 'in'
                : 'pre',
            homeScore: home?.score,
            awayScore: away?.score,
            source: 'espn' as const,
          };
        })
        .filter((g) => g.home && g.away && g.commenceTimeUTC);

      cache.set(cacheKey, { ts: now, data: games });
      return okJSON({ ok: true, games });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError?.name === 'AbortError') {
        return okJSON({ ok: false, error: 'Request timeout after 12 seconds', games: [] });
      }
      return okJSON({ ok: false, error: fetchError?.message || 'Fetch failed', games: [] });
    }
  } catch (err: any) {
    return okJSON({ ok: false, error: err?.message || 'Unknown error occurred', games: [] });
  }
}
