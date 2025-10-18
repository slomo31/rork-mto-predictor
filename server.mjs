import { createServer } from 'http';
import { URL } from 'url';

const PORT = Number(process.env.API_PORT || 3000);
const HOST = process.env.API_HOST || '0.0.0.0';

const TTL_MS = 2 * 60 * 1000;
/** @type {Map<string, { ts: number; data: any }>} */
const cache = new Map();

function json(res, body, status = 200, extraHeaders = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'public, s-maxage=120, stale-while-revalidate=120',
    'access-control-allow-origin': '*',
    ...extraHeaders,
  });
  res.end(payload);
}

function notFound(res) {
  json(res, { ok: false, error: 'Not found' }, 404);
}

function options(res) {
  res.writeHead(204, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end();
}

const ESPN_SPORT_PATHS = {
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  mlb: 'baseball/mlb',
  ncaa_fb: 'football/college-football',
  ncaa_bb: 'basketball/mens-college-basketball',
  soccer: 'soccer/usa.1',
};

const ODDS_SPORT_KEY_MAPPING = {
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  nhl: 'icehockey_nhl',
  mlb: 'baseball_mlb',
  ncaa_fb: 'americanfootball_ncaaf',
  ncaa_bb: 'basketball_ncaab',
  soccer: 'soccer_usa_mls',
};

createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) return notFound(res);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname, searchParams } = url;

    if (req.method === 'OPTIONS') return options(res);

    if (pathname === '/api/espn-api' && req.method === 'GET') {
      const requestedSport = String(searchParams.get('sport') || 'nba').toLowerCase();
      const dates = searchParams.get('dates') || '';
      const sportPath = ESPN_SPORT_PATHS[requestedSport];
      if (!sportPath) return json(res, { ok: true, games: [] });

      const cacheKey = `espn:${requestedSport}:${dates || 'today'}`;
      const now = Date.now();
      const cached = cache.get(cacheKey);
      if (cached && now - cached.ts < TTL_MS) {
        return json(res, { ok: true, games: cached.data });
      }

      const query = dates ? `?dates=${encodeURIComponent(dates)}` : '';
      const fetchUrl = `https://site.web.api.espn.com/apis/v2/sports/${sportPath}/scoreboard${query}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
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
        if (!txt || txt.trim().length === 0) return json(res, { ok: false, error: 'Empty response from ESPN', games: [] });
        if (txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) return json(res, { ok: false, error: 'ESPN returned HTML error page', games: [] });

        let raw;
        try { raw = JSON.parse(txt); } catch { return json(res, { ok: false, error: 'Invalid JSON response from ESPN', games: [] }); }
        if (!response.ok) return json(res, { ok: false, error: `HTTP ${response.status}`, games: [] });

        const events = Array.isArray(raw?.events) ? raw.events : [];
        const games = events.map((event) => {
          const comp = event?.competitions?.[0];
          const home = comp?.competitors?.find((c) => c?.homeAway === 'home');
          const away = comp?.competitors?.find((c) => c?.homeAway === 'away');
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
            status: event?.status?.type?.name === 'STATUS_FINAL' ? 'post' : (event?.status?.type?.state === 'in' ? 'in' : 'pre'),
            homeScore: home?.score,
            awayScore: away?.score,
            source: 'espn',
          };
        }).filter((g) => g.home && g.away && g.commenceTimeUTC);

        cache.set(cacheKey, { ts: now, data: games });
        return json(res, { ok: true, games });
      } catch (e) {
        return json(res, { ok: false, error: e?.message || 'Fetch failed', games: [] });
      }
    }

    if (pathname === '/api/odds-api' && req.method === 'GET') {
      const requested = searchParams.get('sport') || searchParams.get('sportKey') || 'basketball_nba';
      const sportKey = (ODDS_SPORT_KEY_MAPPING[String(requested).toLowerCase()]) || String(requested);

      const KEY = String(process.env.EXPO_PUBLIC_ODDSAPI_KEY || process.env.ODDSAPI_KEY || '').trim();
      const enabled = String(process.env.EXPO_PUBLIC_ENABLE_ODDSAPI || process.env.ENABLE_ODDSAPI || 'true').trim();
      if (!KEY) return json(res, { ok: false, error: 'No API key configured', games: [] });
      if (enabled !== 'true') return json(res, { ok: true, games: [] });

      const cacheKey = `odds:${sportKey}`;
      const now = Date.now();
      const cached = cache.get(cacheKey);
      if (cached && now - cached.ts < TTL_MS) return json(res, { ok: true, games: cached.data });

      const fetchUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds?apiKey=${encodeURIComponent(KEY)}&markets=totals&oddsFormat=american&regions=us`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'SportsApp/1.0' },
        });
        clearTimeout(timeout);
        const responseText = await response.text();
        if (!responseText || responseText.trim().length === 0) return json(res, { ok: false, error: 'Empty response', games: [] });
        const trimmed = responseText.trim();
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return json(res, { ok: false, error: 'HTML error page - check API key / endpoint', games: [] });

        let rawData;
        try { rawData = JSON.parse(responseText); } catch { return json(res, { ok: false, error: 'Invalid JSON', games: [] }); }

        if (!response.ok) {
          if (response.status === 401) return json(res, { ok: false, error: 'Invalid API key', games: [] });
          if (response.status === 429) return json(res, { ok: false, error: 'Rate limit exceeded', games: [] });
          if (response.status === 400) return json(res, { ok: false, error: `Invalid sport key: ${sportKey}`, games: [] });
          return json(res, { ok: false, error: `HTTP ${response.status}`, games: [] }, response.status);
        }

        if (rawData && typeof rawData === 'object' && !Array.isArray(rawData) && rawData.message) {
          return json(res, { ok: false, error: rawData.message, games: [] });
        }

        function median(nums) {
          if (!nums.length) return undefined;
          const arr = [...nums].sort((a, b) => a - b);
          const mid = Math.floor(arr.length / 2);
          return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
        }
        function std(nums) {
          if (nums.length < 2) return undefined;
          const m = nums.reduce((a, b) => a + b, 0) / nums.length;
          const v = nums.reduce((a, b) => a + (b - m) * (b - m), 0) / nums.length;
          return Math.sqrt(v);
        }

        const games = (Array.isArray(rawData) ? rawData : []).map((game) => {
          const totals = [];
          const commenceTimeUTC = game?.commence_time;
          (game?.bookmakers ?? []).forEach((bookmaker) => {
            (bookmaker?.markets ?? []).forEach((market) => {
              if (market?.key === 'totals') {
                (market?.outcomes ?? []).forEach((outcome) => {
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
            source: 'oddsapi',
          };
        }).filter((g) => g.home && g.away && typeof g.commenceTimeUTC === 'string');

        cache.set(cacheKey, { ts: now, data: games });
        return json(res, { ok: true, games });
      } catch (e) {
        return json(res, { ok: false, error: e?.name === 'AbortError' ? 'Request timeout' : (e?.message || 'Fetch failed'), games: [] });
      }
    }

    return notFound(res);
  } catch (e) {
    return json(res, { ok: false, error: e?.message || 'Server error' }, 500);
  }
}).listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`);
});
