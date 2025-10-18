// app/api/odds/route.ts

export const runtime = 'nodejs';        // <— Force Node (not Edge)
export const dynamic = 'force-dynamic'; // <— Disable static caching of this route

const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

const API_BASE = 'https://api.the-odds-api.com/v4/sports';

function okJSON(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=120',
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

// Accept a bunch of inputs and normalize to OddsAPI keys
const SPORT_KEY_MAPPING: Record<string, string> = {
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  nhl: 'icehockey_nhl',
  mlb: 'baseball_mlb',
  ncaa_fb: 'americanfootball_ncaaf',
  ncaafb: 'americanfootball_ncaaf',
  cfb: 'americanfootball_ncaaf',
  ncaa_bb: 'basketball_ncaab',
  ncaabb: 'basketball_ncaab',
  cbb: 'basketball_ncaab',
  soccer: 'soccer_epl', // adjust if you want a different league
};

function normalizeSportKey(raw?: string | null) {
  if (!raw) return 'basketball_nba';
  const k = raw.toLowerCase().replace(/[\s\-]/g, '');
  return SPORT_KEY_MAPPING[k] || SPORT_KEY_MAPPING[raw.toLowerCase()] || 'basketball_nba';
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get('sportKey') || url.searchParams.get('sport') || 'nba';
  const sportKey = normalizeSportKey(requested);

  const KEY = process.env.ODDSAPI_KEY || process.env.EXPO_PUBLIC_ODDSAPI_KEY;
  const enabled = (process.env.ENABLE_ODDSAPI || process.env.EXPO_PUBLIC_ENABLE_ODDSAPI || '').toString();

  // Minimal runtime diagnostics (will show in server logs)
  console.log(`[OddsAPI] requested=${requested} -> key=${sportKey}`);
  console.log(`[OddsAPI] keyPresent=${!!KEY} enabled=${enabled}`);

  // If disabled or no key, return empty (do not throw)
  if (!KEY || enabled !== 'true') {
    return okJSON({
      ok: true,
      games: [],
      hint: !KEY ? 'No API key configured' : 'ENABLE_ODDSAPI is not "true"',
    });
  }

  // Serve from cache if fresh
  const now = Date.now();
  const cacheKey = `odds:${sportKey}`;
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < TTL_MS) {
    return okJSON({ ok: true, games: cached.data, cached: true });
  }

  // Build URL: add both us & us2 regions to increase coverage
  const fetchUrl = `${API_BASE}/${sportKey}/odds` +
    `?apiKey=${encodeURIComponent(KEY)}` +
    `&markets=totals` +
    `&regions=us,us2` +
    `&bookmakers=betmgm,fanduel,draftkings,pointsbet` +
    `&oddsFormat=american`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let resp: Response | null = null;
  let text = '';
  try {
    resp = await fetch(fetchUrl, {
      signal: controller.signal,
      cache: 'no-store',         // never cache a stale error page
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MTO-Predictor/1.0 (+fetch server route)',
      },
      // @ts-expect-error — Next.js/hono may support this
      next: { revalidate: 0 },   // avoid framework-level caching
    });
    clearTimeout(timeout);

    text = await resp.text();

    // OddsAPI sometimes returns HTML for errors via CDN/edge
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      const first = text.slice(0, 400);
      return okJSON({
        ok: false,
        games: [],
        error: `Non-JSON from OddsAPI (status ${resp.status})`,
        sample: first,
        hint: 'Check ODDSAPI_KEY, rate limit, and server can reach external network.',
      }, 200);
    }

    const raw = JSON.parse(text);

    if (!resp.ok) {
      return okJSON({
        ok: false,
        games: [],
        error: `HTTP ${resp.status}`,
        detail: typeof raw === 'object' ? raw : undefined,
        hint: 'Likely rate-limit or invalid sportKey.',
      }, 200);
    }

    if (!Array.isArray(raw)) {
      return okJSON({
        ok: false,
        games: [],
        error: 'Unexpected response shape (not array)',
        detail: raw,
      }, 200);
    }

    const games = raw.map((g: any) => {
      const totals: number[] = [];
      const commenceTimeUTC: string | undefined = g?.commence_time;

      (g?.bookmakers || []).forEach((bm: any) => {
        (bm?.markets || []).forEach((m: any) => {
          if (m?.key === 'totals') {
            (m?.outcomes || []).forEach((o: any) => {
              if (typeof o?.point === 'number') totals.push(o.point);
            });
          }
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

    cache.set(cacheKey, { ts: Date.now(), data: games });
    return okJSON({ ok: true, games });
  } catch (err: any) {
    clearTimeout(timeout);
    return okJSON({
      ok: false,
      games: [],
      error: err?.message || String(err),
      hint: 'If this persists, confirm EXPO_PUBLIC_API_BASE and that server route is reachable from device.',
    }, 200);
  }
}