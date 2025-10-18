export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Cached = { ts: number; data: any };

type Meta = {
  upstreamUrl?: string;
  upstreamStatus?: number;
  durationMs?: number;
};

const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, Cached>();

const API_BASE = 'https://api.the-odds-api.com/v4/sports';

const SPORT_KEY_MAPPING: Record<string, string> = {
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  nhl: 'icehockey_nhl',
  mlb: 'baseball_mlb',
  ncaa_fb: 'americanfootball_ncaaf',
  ncaa_bb: 'basketball_ncaab',
  soccer: 'soccer_usa_mls',
};

function okJSON(data: any, status = 200, meta?: Meta) {
  return new Response(JSON.stringify({ ...data, meta }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=120',
      'access-control-allow-origin': '*',
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
    const requested =
      url.searchParams.get('sport') ||
      url.searchParams.get('sportKey') ||
      'basketball_nba';

    const sportKey =
      SPORT_KEY_MAPPING[String(requested).toLowerCase()] || String(requested);

    const KEY =
      (process.env.EXPO_PUBLIC_ODDSAPI_KEY || process.env.ODDSAPI_KEY || '').trim();
    const enabled =
      (process.env.EXPO_PUBLIC_ENABLE_ODDSAPI || process.env.ENABLE_ODDSAPI || 'true').trim();

    if (!KEY) {
      return okJSON({ ok: false, error: 'No API key configured', games: [] });
    }
    if (enabled !== 'true') {
      return okJSON({ ok: true, games: [] });
    }

    const now = Date.now();
    const cacheKey = `odds:${sportKey}`;
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      return okJSON({ ok: true, games: cached.data });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const fetchUrl = `${API_BASE}/${encodeURIComponent(sportKey)}/odds?apiKey=${encodeURIComponent(
        KEY
      )}&markets=totals&oddsFormat=american&regions=us`;

    const started = Date.now();

    try {
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SportsApp/1.0',
        },
      });

      clearTimeout(timeout);

      const responseText = await response.text();
      const meta: Meta = {
        upstreamUrl: fetchUrl,
        upstreamStatus: response.status,
        durationMs: Date.now() - started,
      };

      if (!responseText || responseText.trim().length === 0) {
        return okJSON({ ok: false, error: 'Empty response', games: [] }, 200, meta);
      }
      const trimmed = responseText.trim();
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        return okJSON({ ok: false, error: 'HTML error page - check API key / endpoint', games: [] }, 200, meta);
      }

      let rawData: any;
      try {
        rawData = JSON.parse(responseText);
      } catch {
        return okJSON({ ok: false, error: 'Invalid JSON', games: [] }, 200, meta);
      }

      if (!response.ok) {
        if (response.status === 401)
          return okJSON({ ok: false, error: 'Invalid API key', games: [] }, 200, meta);
        if (response.status === 429)
          return okJSON({ ok: false, error: 'Rate limit exceeded', games: [] }, 200, meta);
        if (response.status === 400)
          return okJSON({ ok: false, error: `Invalid sport key: ${sportKey}`, games: [] }, 200, meta);
        return okJSON({ ok: false, error: `HTTP ${response.status}`, games: [] }, response.status, meta);
      }

      if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
        if ((rawData as any).message)
          return okJSON({ ok: false, error: (rawData as any).message, games: [] }, 200, meta);
      }

      const games = (Array.isArray(rawData) ? rawData : [])
        .map((game: any) => {
          const totals: number[] = [];
          const commenceTimeUTC: string | undefined = game?.commence_time;

          (game?.bookmakers ?? []).forEach((bookmaker: any) => {
            (bookmaker?.markets ?? []).forEach((market: any) => {
              if (market?.key === 'totals') {
                (market?.outcomes ?? []).forEach((outcome: any) => {
                  if (typeof outcome?.point === 'number') totals.push(outcome.point);
                });
              }
            });
          });

          return {
            id: game?.id,
            home: game?.home_team,
            away: game?.away_team,
            commenceTimeUTC,
            total: median(totals),
            numBooks: totals.length,
            stdBooks: std(totals),
            source: 'oddsapi' as const,
          };
        })
        .filter((g: any) => g.home && g.away && typeof g.commenceTimeUTC === 'string');

      cache.set(cacheKey, { ts: now, data: games });
      return okJSON({ ok: true, games }, 200, meta);
    } catch (fetchError: any) {
      clearTimeout(timeout);
      const meta: Meta = { upstreamUrl: fetchUrl, durationMs: Date.now() - started };
      if (fetchError?.name === 'AbortError') {
        return okJSON({ ok: false, error: 'Request timeout', games: [] }, 200, meta);
      }
      return okJSON({ ok: false, error: fetchError?.message || 'Fetch failed', games: [] }, 200, meta);
    }
  } catch (err: any) {
    return okJSON({ ok: false, error: err?.message || 'Unknown error', games: [] });
  }
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
