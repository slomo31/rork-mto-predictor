import http from "http";
import fetch from "node-fetch";
import 'dotenv/config';
import http from 'http';

const PORT = process.env.API_PORT || 3000;
const HOST = process.env.API_HOST || "0.0.0.0";
const TTL_MS = 2 * 60 * 1000;
const cache = new Map();

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=120, stale-while-revalidate=120",
  });
  res.end(JSON.stringify(data));
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const key = url.searchParams.get("sportKey") || url.searchParams.get("sport");
  const dates = url.searchParams.get("dates");

  // OddsAPI endpoint
  if (path === "/api/odds-api") {
    const cacheKey = `odds:${key}`;
    const now = Date.now();
    if (cache.has(cacheKey) && now - cache.get(cacheKey).ts < TTL_MS)
      return sendJSON(res, cache.get(cacheKey).data);

    const ODDS_KEY = process.env.ODDSAPI_KEY || process.env.EXPO_PUBLIC_ODDSAPI_KEY;
    if (!ODDS_KEY) return sendJSON(res, { ok: false, error: "Missing OddsAPI key" }, 400);

    const apiUrl = `https://api.the-odds-api.com/v4/sports/${key}/odds?apiKey=${ODDS_KEY}&regions=us&markets=totals&oddsFormat=american`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      cache.set(cacheKey, { ts: now, data });
      return sendJSON(res, { ok: true, data });
    } catch (err) {
      return sendJSON(res, { ok: false, error: err.message }, 500);
    }
  }

  // ESPN endpoint
  if (path === "/api/espn-api") {
    const cacheKey = `espn:${key}:${dates}`;
    const now = Date.now();
    if (cache.has(cacheKey) && now - cache.get(cacheKey).ts < TTL_MS)
      return sendJSON(res, cache.get(cacheKey).data);

    const sportPathMap = {
      nfl: "football/nfl",
      nba: "basketball/nba",
      mlb: "baseball/mlb",
      nhl: "hockey/nhl",
      ncaa_fb: "football/college-football",
      ncaa_bb: "basketball/mens-college-basketball",
      soccer: "soccer/usa.1",
    };
    const sportPath = sportPathMap[key] || "basketball/nba";
    const fetchUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard${dates ? `?dates=${dates}` : ""}`;

    try {
      const response = await fetch(fetchUrl);
      const data = await response.json();
      cache.set(cacheKey, { ts: now, data });
      return sendJSON(res, { ok: true, data });
    } catch (err) {
      return sendJSON(res, { ok: false, error: err.message }, 500);
    }
  }

  sendJSON(res, { ok: false, error: "Unknown endpoint" }, 404);
}

const server = http.createServer(handleRequest);
server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`);
});