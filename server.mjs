import 'dotenv/config';
import http from 'http';
import { URL } from 'url';

const HOST = process.env.API_HOST || '0.0.0.0';
const PORT = Number(process.env.API_PORT || 3000);
const ODDS_KEY = process.env.ODDS_API_KEY;

function send(res, body, status = 200, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=120, stale-while-revalidate=120',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

async function forwardOdds(sportKey) {
  if (!ODDS_KEY) throw new Error('Missing OddsAPI key');
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h,spreads,totals');
  url.searchParams.set('apiKey', ODDS_KEY);
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`OddsAPI ${r.status}: ${await r.text()}`);
  return r.json();
}

async function forwardEspn(sport, dates) {
  const map = {
    nfl: 'football/nfl',
    nba: 'basketball/nba',
    nhl: 'hockey/nhl',
    mlb: 'baseball/mlb',
    ncaa_fb: 'football/college-football',
    ncaa_bb: 'basketball/mens-college-basketball',
    soccer: 'soccer/usa.1',
  };
  const path = map[sport];
  if (!path) throw new Error('Unknown sport');
  const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`);
  if (dates) url.searchParams.set('dates', dates);
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`ESPN ${r.status}: ${await r.text()}`);
  return r.json();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method !== 'GET') return send(res, { ok: false, error: 'Method not allowed' }, 405);

    if (url.pathname === '/api/odds-api') {
      const sportKey = url.searchParams.get('sportKey');
      if (!sportKey) return send(res, { ok: false, error: 'Missing sportKey' }, 400);
      const data = await forwardOdds(sportKey);
      return send(res, { ok: true, data });
    }

    if (url.pathname === '/api/espn-api') {
      const sport = url.searchParams.get('sport');
      const dates = url.searchParams.get('dates') || undefined;
      if (!sport) return send(res, { ok: false, error: 'Missing sport' }, 400);
      const data = await forwardEspn(sport, dates);
      return send(res, { ok: true, data });
    }

    return send(res, { ok: false, error: 'Not found' }, 404);
  } catch (e) {
    return send(res, { ok: false, error: String(e.message || e) }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`);
});