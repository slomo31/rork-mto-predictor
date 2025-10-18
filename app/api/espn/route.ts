const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any }>();

const ESPN_BASES = [
  'https://site.api.espn.com/apis/site/v2/sports',
  'https://site.web.api.espn.com/apis/site/v2/sports',
];

function okJSON(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=60'
    },
  });
}

async function fetchWithRetry(url: string, tries = 2): Promise<any> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const r = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const text = await r.text();
      
      const isJson =
        (r.headers.get('content-type') || '').includes('application/json') ||
        text.trim().startsWith('{') ||
        text.trim().startsWith('[');
      
      if (!r.ok) {
        lastErr = { error: `HTTP ${r.status}`, bodySnippet: text.slice(0, 200) };
        continue;
      }
      
      if (!isJson) {
        lastErr = { error: 'Not JSON', bodySnippet: text.slice(0, 200) };
        continue;
      }
      
      return JSON.parse(text);
    } catch (e: any) {
      lastErr = { error: e.message || 'network error' };
      if (e.name !== 'AbortError') {
        await new Promise(res => setTimeout(res, 300 * (i + 1)));
      }
    }
  }
  throw lastErr || new Error('ESPN fetch failed');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path');
    const dates = searchParams.get('dates');
    
    console.log(`[ESPN Route] Request for path=${path}, dates=${dates}`);
    
    if (!path) return okJSON({ error: 'Missing path param' }, 400);
    
    const queryStr = dates ? `?dates=${dates}` : '';
    const cacheKey = `espn:${path}${queryStr}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    
    if (cached && now - cached.ts < TTL_MS) {
      console.log(`[ESPN Route] Cache hit: ${cached.data.length} games`);
      return okJSON({ source: 'cache', games: cached.data });
    }
    
    let lastErr: any;
    for (const base of ESPN_BASES) {
      const url = `${base}${path}${queryStr}`;
      console.log(`[ESPN Route] Trying: ${url}`);
      try {
        const json = await fetchWithRetry(url, 2);
        
        if (!json || !Array.isArray(json.events)) {
          lastErr = { error: 'No events array' };
          console.log(`[ESPN Route] No events array in response`);
          continue;
        }
        
        console.log(`[ESPN Route] Received ${json.events.length} events`);
        
        const games = json.events.map((e: any) => {
          const comp = e?.competitions?.[0];
          if (!comp) return null;
          
          const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
          const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
          
          if (!home || !away) return null;
          
          const line = comp.odds?.[0]?.overUnder;
          const homeScore = home.score ? parseFloat(home.score) : undefined;
          const awayScore = away.score ? parseFloat(away.score) : undefined;
          
          return {
            id: e.id,
            home: home.team?.displayName,
            away: away.team?.displayName,
            homeId: home.team?.id,
            awayId: away.team?.id,
            homeLogo: home.team?.logo,
            awayLogo: away.team?.logo,
            homeScore,
            awayScore,
            commenceTimeUTC: e.date,
            venue: comp.venue?.fullName,
            status: e.status?.type?.state,
            total: typeof line === 'number' ? line : undefined,
            numBooks: line ? 1 : 0,
            booksStd: 0,
            source: 'espn' as const,
          };
        }).filter(Boolean);
        
        console.log(`[ESPN Route] Processed ${games.length} games`);
        if (games.length > 0) {
          console.log(`[ESPN Route] First game: ${games[0]?.away} @ ${games[0]?.home} at ${games[0]?.commenceTimeUTC}`);
        }
        
        cache.set(cacheKey, { ts: now, data: games });
        return okJSON({ source: 'espn', games });
      } catch (e: any) {
        console.error(`[ESPN Route] Error with base ${base}:`, e);
        lastErr = e;
      }
    }
    
    console.error(`[ESPN Route] All bases failed`);
    return okJSON({ source: 'none', games: [], error: 'All ESPN bases failed', detail: lastErr }, 200);
  } catch (err: any) {
    console.error(`[ESPN Route] Top-level error:`, err);
    return okJSON({ source: 'none', games: [], error: 'ESPN proxy failed', detail: err.message }, 200);
  }
}
