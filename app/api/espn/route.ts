const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

const BASES = [
  'https://site.api.espn.com/apis/site/v2/sports',
];

function okJSON(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=120'
    },
  });
}

async function fetchJSON(url: string, timeoutMs = 7500) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'MTO/1.0' },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(`Non-JSON from ESPN: ${res.status}`);
    }
    const json = await res.json();
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(to);
  }
}

function normalizeEvents(data: any) {
  const events = data?.events ?? [];
  const games = events.map((ev: any) => {
    const comp = ev?.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    return {
      id: ev?.id,
      home: home?.team?.displayName,
      away: away?.team?.displayName,
      homeId: home?.team?.id,
      awayId: away?.team?.id,
      homeLogo: home?.team?.logo,
      awayLogo: away?.team?.logo,
      venue: comp?.venue?.fullName,
      commenceTimeUTC: ev?.date,
      total: comp?.odds?.[0]?.overUnder,
      source: 'espn' as const,
    };
  }).filter((g: any) => g.home && g.away && g.commenceTimeUTC);
  return games;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') || '/basketball/nba/scoreboard';
  const dates = url.searchParams.get('dates');
  const qs = dates ? `?dates=${dates}` : '';
  
  const cacheKey = `${path}${qs}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < TTL_MS) {
    console.log(`[ESPN Route] Cache hit: ${cacheKey}`);
    return okJSON({ ok: true, games: cached.data });
  }

  let lastErr: any = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const base of BASES) {
      try {
        const full = `${base}${path}${qs}`;
        console.log(`[ESPN Route] Fetching: ${full}`);
        const { ok, status, json } = await fetchJSON(full);
        if (!ok) {
          lastErr = `HTTP ${status}`;
          throw new Error(`ESPN status ${status}`);
        }
        const games = normalizeEvents(json);
        console.log(`[ESPN Route] ✓ ${games.length} games`);
        cache.set(cacheKey, { ts: now, data: games });
        return okJSON({ ok: true, games });
      } catch (err) {
        lastErr = err;
        console.warn(`[ESPN Route] Attempt ${attempt + 1} failed for ${base}:`, err);
      }
    }
    await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
  }
  
  console.error(`[ESPN Route] All attempts failed`);
  return okJSON({ ok: false, error: String(lastErr), games: [] }, 200);
}
