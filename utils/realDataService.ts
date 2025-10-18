import { Game, Sport, TeamStats, GameContext, CalculationInput } from '@/types/sports';
import { getLeagueAverages } from './mtoEngine';
import { normalizeTeam } from './OddsService';
import { toYyyymmddUTC, buildUtcWindowForLocalDate, withinUTC } from './date';
import { mergeGames } from './gameMerger';
import { buildApiUrl } from './apiUrl';

const DEV = process.env.NODE_ENV !== 'production';

export type ApiProvider = 'espn' | 'oddsapi';
export type ApiHealthPerSport = {
  ok: boolean;
  lastError?: string;
  lastChecked: number;
  lastCount?: number;
};

const apiHealth: Record<ApiProvider, Record<Sport | 'ALL', ApiHealthPerSport>> = {
  espn: {
    ALL: { ok: true, lastChecked: 0 },
    NFL: { ok: true, lastChecked: 0 },
    NBA: { ok: true, lastChecked: 0 },
    NHL: { ok: true, lastChecked: 0 },
    MLB: { ok: true, lastChecked: 0 },
    NCAA_FB: { ok: true, lastChecked: 0 },
    NCAA_BB: { ok: true, lastChecked: 0 },
    SOCCER: { ok: true, lastChecked: 0 },
    TENNIS: { ok: false, lastChecked: 0 },
  },
  oddsapi: {
    ALL: { ok: true, lastChecked: 0 },
    NFL: { ok: true, lastChecked: 0 },
    NBA: { ok: true, lastChecked: 0 },
    NHL: { ok: true, lastChecked: 0 },
    MLB: { ok: true, lastChecked: 0 },
    NCAA_FB: { ok: true, lastChecked: 0 },
    NCAA_BB: { ok: true, lastChecked: 0 },
    SOCCER: { ok: true, lastChecked: 0 },
    TENNIS: { ok: false, lastChecked: 0 },
  },
};

function setApiHealth(provider: ApiProvider, sport: Sport | 'ALL', data: Partial<ApiHealthPerSport>) {
  const now = Date.now();
  const prev = apiHealth[provider][sport];
  apiHealth[provider][sport] = {
    ok: data.ok ?? prev.ok ?? false,
    lastError: data.lastError,
    lastChecked: now,
    lastCount: data.lastCount ?? prev.lastCount,
  };
  const aggPrev = apiHealth[provider]['ALL'];
  void aggPrev;
  const anyBad = (['NFL','NBA','NHL','MLB','NCAA_FB','NCAA_BB','SOCCER','TENNIS'] as Sport[]).some(s => apiHealth[provider][s]?.ok === false);
  apiHealth[provider]['ALL'] = { ok: !anyBad, lastChecked: now, lastError: anyBad ? 'One or more sports failing' : undefined };
}

export function getApiHealthSnapshot() {
  return JSON.parse(JSON.stringify(apiHealth)) as typeof apiHealth;
}

type RawGame = {
  id: string;
  home: string;
  away: string;
  homeId?: string;
  awayId?: string;
  homeLogo?: string;
  awayLogo?: string;
  commenceTimeUTC: string;
  venue?: string;
  status?: string;
  total?: number;
  numBooks?: number;
  stdBooks?: number;
  source: 'oddsapi' | 'espn' | 'merged';
};

const SOURCE_POLICY: Record<Sport, ('oddsapi' | 'espn')[]> = {
  NFL: ['oddsapi', 'espn'],
  NCAA_FB: ['oddsapi', 'espn'],
  NBA: ['oddsapi', 'espn'],
  NCAA_BB: ['oddsapi', 'espn'],
  NHL: ['oddsapi', 'espn'],
  MLB: ['oddsapi', 'espn'],
  SOCCER: ['oddsapi', 'espn'],
  TENNIS: ['oddsapi'],
};

const ESPN_SPORT_KEYS: Partial<Record<Sport, string>> = {
  NFL: 'nfl',
  NBA: 'nba',
  NHL: 'nhl',
  MLB: 'mlb',
  NCAA_FB: 'ncaa_fb',
  NCAA_BB: 'ncaa_bb',
  SOCCER: 'soccer',
};

const ODDSAPI_SPORT_KEYS: Partial<Record<Sport, string>> = {
  NFL: 'americanfootball_nfl',
  MLB: 'baseball_mlb',
  NBA: 'basketball_nba',
  NHL: 'icehockey_nhl',
  NCAA_FB: 'americanfootball_ncaaf',
  NCAA_BB: 'basketball_ncaab',
  SOCCER: 'soccer_usa_mls',
};

async function fetchFromOddsAPI(sport: Sport): Promise<RawGame[]> {
  const sportKey = ODDSAPI_SPORT_KEYS[sport];
  if (!sportKey) {
    console.log(`[${sport}] No OddsAPI sport key configured`);
    return [];
  }

  try {
    const primaryUrl = buildApiUrl(`/api/odds-api?sportKey=${encodeURIComponent(sportKey)}`);
    const fallbackUrl = buildApiUrl(`/api/odds-api/?sportKey=${encodeURIComponent(sportKey)}`);
    const legacyUrlA = buildApiUrl(`/api/odds?sportKey=${encodeURIComponent(sportKey)}`);
    const legacyUrlB = buildApiUrl(`/api/odds?sport=${encodeURIComponent(sportKey)}`);
    let urlToUse = primaryUrl;

    console.log(`[${sport}] OddsAPI: Fetching ${urlToUse}`);
    
    let res = await fetch(urlToUse, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    console.log(`[${sport}] OddsAPI: Response status ${res.status}`);

    let responseText = await res.text();

    const isHTML = (t: string) => t.trim().startsWith('<!DOCTYPE') || t.trim().startsWith('<html');

    if (!res.ok || isHTML(responseText)) {
      console.warn(`[${sport}] OddsAPI: Primary path returned ${res.status}${isHTML(responseText) ? ' (HTML)' : ''}. Retrying with trailing slash...`);
      urlToUse = fallbackUrl;
      res = await fetch(urlToUse, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      responseText = await res.text();
      console.log(`[${sport}] OddsAPI: Fallback status ${res.status}`);
    }

    if (!res.ok || isHTML(responseText)) {
      console.warn(`[${sport}] OddsAPI: Fallback failed (${res.status}${isHTML(responseText) ? ' HTML' : ''}). Trying legacy /api/odds route...`);
      for (const alt of [legacyUrlA, legacyUrlB]) {
        try {
          urlToUse = alt;
          const altRes = await fetch(urlToUse, { headers: { accept: 'application/json' }, cache: 'no-store' });
          let altTxt = await altRes.text();
          if (altRes.ok && !isHTML(altTxt)) {
            res = altRes;
            responseText = altTxt;
            console.log(`[${sport}] OddsAPI: Legacy route succeeded (${urlToUse})`);
            break;
          } else {
            console.warn(`[${sport}] OddsAPI: Legacy route attempt failed (${altRes.status}${isHTML(altTxt) ? ' HTML' : ''})`);
          }
        } catch (err) {
          console.warn(`[${sport}] OddsAPI: Legacy route error:`, String(err));
        }
      }
    }
    
    if (!res.ok) {
      console.warn(`[${sport}] OddsAPI: HTTP error ${res.status}`);
      setApiHealth('oddsapi', sport, { ok: false, lastError: `HTTP ${res.status}` });
      return [];
    }

    if (isHTML(responseText)) {
      console.error(`[${sport}] OddsAPI: Received HTML error page`);
      setApiHealth('oddsapi', sport, { ok: false, lastError: 'HTML error page' });
      return [];
    }

    let json;
    try {
      json = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[${sport}] OddsAPI: JSON parse error:`, parseError);
      setApiHealth('oddsapi', sport, { ok: false, lastError: 'Invalid JSON' });
      console.error(`[${sport}] OddsAPI: Response:`, responseText.substring(0, 300));
      return [];
    }
    
    if (json?.error) {
      console.error(`[${sport}] OddsAPI: API returned error:`, json.error);
      setApiHealth('oddsapi', sport, { ok: false, lastError: String(json.error) });
      return [];
    }
    
    const games = Array.isArray(json?.games) ? json.games : [];
    console.log(`[${sport}] OddsAPI: ✓ ${games.length} games received`);
    setApiHealth('oddsapi', sport, { ok: true, lastError: undefined, lastCount: games.length });
    
    return games;
  } catch (e: any) {
    console.error(`[${sport}] OddsAPI: Exception:`, e.message || e);
    setApiHealth('oddsapi', sport, { ok: false, lastError: e?.message ?? 'Exception' });
    return [];
  }
}

async function fetchFromESPN(sport: Sport, isoDate: string): Promise<RawGame[]> {
  const espnSportKey = ESPN_SPORT_KEYS[sport];
  if (!espnSportKey) {
    if (DEV) console.log(`[${sport}] No ESPN sport key configured`);
    return [];
  }

  try {
    const dates = toYyyymmddUTC(isoDate);
    const primaryUrl = buildApiUrl(`/api/espn-api?sport=${espnSportKey}&dates=${dates}`);
    const fallbackUrl = buildApiUrl(`/api/espn-api/?sport=${espnSportKey}&dates=${dates}`);
    const legacyUrl = buildApiUrl(`/api/espn?sport=${espnSportKey}&dates=${dates}`);
    let urlToUse = primaryUrl;
    if (DEV) console.log(`[${sport}] ESPN: Fetching ${urlToUse}`);
    
    let res = await fetch(urlToUse, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    let responseText = await res.text();

    const isHTML = (t: string) => t.trim().startsWith('<!DOCTYPE') || t.trim().startsWith('<html');

    if (!res.ok || isHTML(responseText)) {
      if (DEV) console.warn(`[${sport}] ESPN: Primary path returned ${res.status}${isHTML(responseText) ? ' (HTML)' : ''}. Retrying with trailing slash...`);
      urlToUse = fallbackUrl;
      res = await fetch(urlToUse, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      responseText = await res.text();
      if (DEV) console.log(`[${sport}] ESPN: Fallback status ${res.status}`);
    }

    if (!res.ok || isHTML(responseText)) {
      if (DEV) console.warn(`[${sport}] ESPN: Fallback failed (${res.status}${isHTML(responseText) ? ' HTML' : ''}). Trying legacy /api/espn route...`);
      try {
        urlToUse = legacyUrl;
        const alt = await fetch(urlToUse, { headers: { accept: 'application/json' }, cache: 'no-store' });
        const altTxt = await alt.text();
        if (alt.ok && !isHTML(altTxt)) {
          res = alt;
          responseText = altTxt;
          if (DEV) console.log(`[${sport}] ESPN: Legacy route succeeded (${urlToUse})`);
        } else {
          if (DEV) console.warn(`[${sport}] ESPN: Legacy route failed (${alt.status}${isHTML(altTxt) ? ' HTML' : ''})`);
        }
      } catch (err) {
        if (DEV) console.warn(`[${sport}] ESPN: Legacy route error:`, String(err));
      }
    }

    if (!res.ok) {
      if (DEV) console.warn(`[${sport}] ESPN: HTTP ${res.status}`);
      setApiHealth('espn', sport, { ok: false, lastError: `HTTP ${res.status}` });
      return [];
    }

    if (isHTML(responseText)) {
      console.error(`[${sport}] ESPN: Received HTML error page`);
      setApiHealth('espn', sport, { ok: false, lastError: 'HTML error page' });
      return [];
    }

    let json;
    try {
      json = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[${sport}] ESPN: JSON parse error:`, parseError);
      setApiHealth('espn', sport, { ok: false, lastError: 'Invalid JSON' });
      console.error(`[${sport}] ESPN: Response:`, responseText.substring(0, 300));
      return [];
    }
    
    const games = Array.isArray(json?.games) ? json.games : [];
    if (DEV) console.log(`[${sport}] ESPN: ${games.length} games`);
    setApiHealth('espn', sport, { ok: true, lastError: undefined, lastCount: games.length });

    return games;
  } catch (e) {
    if (DEV) console.error(`[${sport}] ESPN error:`, e);
    setApiHealth('espn', sport, { ok: false, lastError: (e as any)?.message ?? 'Exception' });
    return [];
  }
}

export async function fetchUpcomingGames(sport: Sport, isoDate: string): Promise<Game[]> {
  const sources = SOURCE_POLICY[sport] || ['oddsapi'];
  
  console.log(`\n[${sport}] ====== Fetching games for ${isoDate} ======`);
  console.log(`[${sport}] Source policy: ${sources.join(' → ')}`);

  const [year, month, day] = isoDate.split('-').map(Number);
  const localDate = new Date(year!, month! - 1, day!);
  const { startUTC, endUTC } = buildUtcWindowForLocalDate(localDate, 'America/Chicago', 3);

  console.log(`[${sport}] UTC window: ${startUTC.toISOString()} to ${endUTC.toISOString()}`);

  let oddsGames: RawGame[] = [];
  let espnGames: RawGame[] = [];
  let oddsErr: any = null;
  let espnErr: any = null;

  try {
    if (sources.includes('oddsapi')) {
      const games = await fetchFromOddsAPI(sport);
      oddsGames = games.filter((g: RawGame) => withinUTC(g.commenceTimeUTC, startUTC, endUTC));
      console.log(`[${sport}] OddsAPI: ${games.length} total, ${oddsGames.length} in window`);
    }
  } catch (e) {
    oddsErr = String(e);
    console.error(`[${sport}] OddsAPI fetch failed:`, e);
  }

  try {
    if (sources.includes('espn')) {
      const games = await fetchFromESPN(sport, isoDate);
      espnGames = games.filter((g: RawGame) => withinUTC(g.commenceTimeUTC, startUTC, endUTC));
      console.log(`[${sport}] ESPN: ${games.length} total, ${espnGames.length} in window`);
    }
  } catch (e) {
    espnErr = String(e);
    console.error(`[${sport}] ESPN fetch failed:`, e);
  }

  const merged = mergeGames(oddsGames, espnGames);

  console.log(`[${sport}] ✓ Final: ${merged.length} games`);
  
  if (!merged.length && (oddsErr || espnErr)) {
    console.warn(`[${sport}] No games and errors occurred:`, { oddsErr, espnErr });
  }

  if (merged.length > 0 && DEV) {
    merged.slice(0, 3).forEach(g => {
      console.log(`  [${g.source}] ${g.away} @ ${g.home}, Time: ${g.commenceTimeUTC}, Line: ${g.total ?? 'none'}`);
    });
  }
  console.log(`[${sport}] ====== End fetch ======\n`);

  return merged.map(g => ({
    id: `${sport}-${g.source}-${g.id}`,
    sport,
    homeTeam: g.home,
    awayTeam: g.away,
    homeTeamId: g.homeId || g.home,
    awayTeamId: g.awayId || g.away,
    gameDate: g.commenceTimeUTC,
    venue: g.venue || 'TBD',
    status: (g.status === 'pre' || !g.status) ? 'scheduled' : g.status === 'in' ? 'live' : 'completed',
    homeTeamLogo: g.homeLogo,
    awayTeamLogo: g.awayLogo,
    sportsbookLine: g.total,
    dataSource: g.source,
  }));
}

async function fetchRecentTeamGamesFromScoreboards(
  teamId: string,
  sport: Sport,
  fromIsoDate: string,
  maxGames = 10
): Promise<any[]> {
  const espnSportKey = ESPN_SPORT_KEYS[sport];
  if (!espnSportKey) return [];

  const collected: any[] = [];
  let cursor = new Date(fromIsoDate);

  if (DEV) console.log(`[Backfill] Team ${teamId} from ${fromIsoDate}`);

  for (let i = 0; i < 20 && collected.length < maxGames; i++) {
    cursor.setDate(cursor.getDate() - 1);
    const iso = cursor.toISOString().slice(0, 10);

    try {
      const dates = toYyyymmddUTC(iso);
      const res = await fetch(buildApiUrl(`/api/espn-api?sport=${espnSportKey}&dates=${dates}`), {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) continue;

      const json = await res.json();
      const games = Array.isArray(json?.games) ? json.games : [];

      for (const g of games) {
        const matchHome = normalizeTeam(g.home) === normalizeTeam(teamId) || g.homeId === teamId;
        const matchAway = normalizeTeam(g.away) === normalizeTeam(teamId) || g.awayId === teamId;
        
        if (!matchHome && !matchAway) continue;
        if (g.status !== 'post' && g.status !== 'completed') continue;

        collected.push(g);
        if (collected.length >= maxGames) break;
      }
    } catch (e) {
      if (DEV) console.warn(`[Backfill] Failed ${iso}:`, e);
    }
  }

  if (DEV) console.log(`[Backfill] Found ${collected.length} completed games for ${teamId}`);
  return collected;
}

async function fetchRecentAveragesFromSchedule(
  teamId: string,
  sport: Sport,
  fromIsoDate: string,
  n: number = 10
): Promise<{ avgPointsScored: number; avgPointsAllowed: number; gamesPlayed: number; recentForm: number[] } | null> {
  try {
    const recent = await fetchRecentTeamGamesFromScoreboards(teamId, sport, fromIsoDate, n);
    
    if (recent.length === 0) {
      if (DEV) console.log(`No completed games found for team ${teamId}`);
      return null;
    }

    let ptsFor = 0;
    let ptsAgainst = 0;
    const recentForm: number[] = [];

    for (const g of recent) {
      const normHome = normalizeTeam(g.home);
      const normTeam = normalizeTeam(teamId);
      const isHome = normHome === normTeam || g.homeId === teamId;

      const homeScore = typeof g.homeScore === 'number' ? g.homeScore : 0;
      const awayScore = typeof g.awayScore === 'number' ? g.awayScore : 0;

      if (isHome) {
        ptsFor += homeScore;
        ptsAgainst += awayScore;
        recentForm.push(homeScore);
      } else {
        ptsFor += awayScore;
        ptsAgainst += homeScore;
        recentForm.push(awayScore);
      }
    }

    const gp = recent.length;
    const avgPointsScored = ptsFor / gp;
    const avgPointsAllowed = ptsAgainst / gp;

    if (isNaN(avgPointsScored) || isNaN(avgPointsAllowed)) {
      if (DEV) console.log(`Invalid averages for ${teamId}`);
      return null;
    }

    if (DEV) console.log(`Team ${teamId}: ${gp} games, PPG=${avgPointsScored.toFixed(1)}, PAPG=${avgPointsAllowed.toFixed(1)}`);

    return {
      avgPointsScored,
      avgPointsAllowed,
      gamesPlayed: gp,
      recentForm
    };
  } catch (error) {
    if (DEV) console.error(`Error fetching team stats for ${teamId}:`, error);
    return null;
  }
}

export async function fetchGameCalculationInput(game: Game, isoDate?: string): Promise<CalculationInput> {
  const leagueAverages = getLeagueAverages(game.sport);
  const dateForBackfill = isoDate || new Date().toISOString().slice(0, 10);
  
  if (DEV) console.log(`Fetching calculation input for ${game.awayTeam} @ ${game.homeTeam}`);
  
  if (!game.homeTeamId || !game.awayTeamId) {
    if (DEV) console.warn('Missing team IDs, using league averages');
    const defaultAvgPerTeam = leagueAverages.avgTotal / 2;
    
    const homeTeamStats: TeamStats = {
      teamId: game.homeTeamId || 'unknown',
      teamName: game.homeTeam,
      avgPointsScored: defaultAvgPerTeam,
      avgPointsAllowed: defaultAvgPerTeam,
      pace: leagueAverages.avgPace ?? 100,
      offensiveEfficiency: leagueAverages.avgOffensiveEfficiency ?? 1.0,
      defensiveEfficiency: leagueAverages.avgDefensiveEfficiency ?? 1.0,
      recentForm: [],
      gamesPlayed: 0,
    };
    
    const awayTeamStats: TeamStats = {
      teamId: game.awayTeamId || 'unknown',
      teamName: game.awayTeam,
      avgPointsScored: defaultAvgPerTeam,
      avgPointsAllowed: defaultAvgPerTeam,
      pace: leagueAverages.avgPace ?? 100,
      offensiveEfficiency: leagueAverages.avgOffensiveEfficiency ?? 1.0,
      defensiveEfficiency: leagueAverages.avgDefensiveEfficiency ?? 1.0,
      recentForm: [],
      gamesPlayed: 0,
    };
    
    return {
      homeTeamStats,
      awayTeamStats,
      gameContext: {
        venue: 'home',
        restDays: 3,
        injuries: [],
        travelDistance: undefined,
        weather: undefined,
      },
      sport: game.sport,
      sportsbookLine: game.sportsbookLine,
      leagueAverages
    };
  }
  
  const [homeRecentStats, awayRecentStats] = await Promise.all([
    fetchRecentAveragesFromSchedule(game.homeTeamId, game.sport, dateForBackfill, 10),
    fetchRecentAveragesFromSchedule(game.awayTeamId, game.sport, dateForBackfill, 10)
  ]);
  
  const defaultAvgPerTeam = leagueAverages.avgTotal / 2;
  
  const homeAvgScored = homeRecentStats?.avgPointsScored ?? defaultAvgPerTeam;
  const homeAvgAllowed = homeRecentStats?.avgPointsAllowed ?? defaultAvgPerTeam;
  const awayAvgScored = awayRecentStats?.avgPointsScored ?? defaultAvgPerTeam;
  const awayAvgAllowed = awayRecentStats?.avgPointsAllowed ?? defaultAvgPerTeam;
  
  const homeTeamStats: TeamStats = {
    teamId: game.homeTeamId,
    teamName: game.homeTeam,
    avgPointsScored: isNaN(homeAvgScored) ? defaultAvgPerTeam : homeAvgScored,
    avgPointsAllowed: isNaN(homeAvgAllowed) ? defaultAvgPerTeam : homeAvgAllowed,
    pace: leagueAverages.avgPace ?? 100,
    offensiveEfficiency: leagueAverages.avgOffensiveEfficiency ?? 1.0,
    defensiveEfficiency: leagueAverages.avgDefensiveEfficiency ?? 1.0,
    recentForm: homeRecentStats?.recentForm ?? [],
    gamesPlayed: homeRecentStats?.gamesPlayed ?? 0,
  };
  
  const awayTeamStats: TeamStats = {
    teamId: game.awayTeamId,
    teamName: game.awayTeam,
    avgPointsScored: isNaN(awayAvgScored) ? defaultAvgPerTeam : awayAvgScored,
    avgPointsAllowed: isNaN(awayAvgAllowed) ? defaultAvgPerTeam : awayAvgAllowed,
    pace: leagueAverages.avgPace ?? 100,
    offensiveEfficiency: leagueAverages.avgOffensiveEfficiency ?? 1.0,
    defensiveEfficiency: leagueAverages.avgDefensiveEfficiency ?? 1.0,
    recentForm: awayRecentStats?.recentForm ?? [],
    gamesPlayed: awayRecentStats?.gamesPlayed ?? 0,
  };

  if (homeRecentStats && DEV) {
    console.log(`Using REAL stats for home team ${game.homeTeam}: PPG=${homeTeamStats.avgPointsScored.toFixed(1)}, PAPG=${homeTeamStats.avgPointsAllowed.toFixed(1)}`);
  } else if (DEV) {
    console.log(`Using league average fallback for home team ${game.homeTeam}: ${defaultAvgPerTeam.toFixed(1)}`);
  }
  
  if (awayRecentStats && DEV) {
    console.log(`Using REAL stats for away team ${game.awayTeam}: PPG=${awayTeamStats.avgPointsScored.toFixed(1)}, PAPG=${awayTeamStats.avgPointsAllowed.toFixed(1)}`);
  } else if (DEV) {
    console.log(`Using league average fallback for away team ${game.awayTeam}: ${defaultAvgPerTeam.toFixed(1)}`);
  }
  
  const gameContext: GameContext = {
    venue: 'home',
    restDays: 3,
    injuries: [],
    travelDistance: undefined,
    weather: undefined,
  };
  
  const sportsbookLine = game.sportsbookLine;
  if (sportsbookLine && DEV) {
    console.log(`Using REAL sportsbook line: ${sportsbookLine}`);
  } else if (DEV) {
    console.log('No sportsbook line available for this game');
  }
  
  return {
    homeTeamStats,
    awayTeamStats,
    gameContext,
    sport: game.sport,
    sportsbookLine,
    leagueAverages
  };
}
