import { Game, Sport, TeamStats, GameContext, CalculationInput } from '@/types/sports';
import { getLeagueAverages } from './mtoEngine';
import { normalizeTeam } from './OddsService';
import { toYyyymmddUTC } from './date';

const DEV = process.env.NODE_ENV !== 'production';

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
  booksStd?: number;
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

const SPORT_API_PATHS: Record<Sport, { league: string; sport: string } | null> = {
  NFL: { league: 'football', sport: 'nfl' },
  NBA: { league: 'basketball', sport: 'nba' },
  NHL: { league: 'hockey', sport: 'nhl' },
  MLB: { league: 'baseball', sport: 'mlb' },
  NCAA_FB: { league: 'football', sport: 'college-football' },
  NCAA_BB: { league: 'basketball', sport: 'mens-college-basketball' },
  SOCCER: { league: 'soccer', sport: 'usa.1' },
  TENNIS: null,
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

function getUTCWindow(isoDate: string): { start: number; end: number } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = Date.UTC(y!, m! - 1, d!, 0, 0, 0);
  const end = Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999);
  return { start, end };
}

function withinWindow(utcMs: number, start: number, end: number): boolean {
  return utcMs >= start && utcMs <= end;
}

async function fetchFromOddsAPI(sport: Sport, isoDate: string): Promise<RawGame[]> {
  const sportKey = ODDSAPI_SPORT_KEYS[sport];
  if (!sportKey) return [];

  try {
    const res = await fetch(`/api/odds?sport=${encodeURIComponent(sportKey)}&regions=us&markets=totals`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      if (DEV) console.warn(`[${sport}] OddsAPI HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    const games = Array.isArray(json?.games) ? json.games : [];
    
    const { start, end } = getUTCWindow(isoDate);
    const filtered = games.filter((g: RawGame) => {
      const t = new Date(g.commenceTimeUTC).getTime();
      return withinWindow(t, start, end);
    });

    if (DEV) console.log(`[${sport}] OddsAPI: ${filtered.length} games on ${isoDate}`);
    return filtered;
  } catch (e) {
    if (DEV) console.warn(`[${sport}] OddsAPI error:`, e);
    return [];
  }
}

async function fetchFromESPN(sport: Sport, isoDate: string): Promise<RawGame[]> {
  const api = SPORT_API_PATHS[sport];
  if (!api) return [];

  try {
    const dates = toYyyymmddUTC(isoDate);
    const path = `/${api.league}/${api.sport}/scoreboard`;
    const res = await fetch(`/api/espn?path=${encodeURIComponent(path)}&dates=${dates}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      if (DEV) console.warn(`[${sport}] ESPN HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    const games = Array.isArray(json?.games) ? json.games : [];

    const { start, end } = getUTCWindow(isoDate);
    const filtered = games.filter((g: RawGame) => {
      const t = new Date(g.commenceTimeUTC).getTime();
      return withinWindow(t, start, end);
    });

    if (DEV) console.log(`[${sport}] ESPN: ${filtered.length} games on ${isoDate}`);
    return filtered;
  } catch (e) {
    if (DEV) console.warn(`[${sport}] ESPN error:`, e);
    return [];
  }
}

function dedupeAndMerge(sources: { games: RawGame[]; source: 'oddsapi' | 'espn' }[]): RawGame[] {
  const map = new Map<string, RawGame>();

  for (const { games, source } of sources) {
    for (const g of games) {
      const normHome = normalizeTeam(g.home);
      const normAway = normalizeTeam(g.away);
      const timeKey = Math.floor(new Date(g.commenceTimeUTC).getTime() / (10 * 60 * 1000));
      const key = `${normHome}|${normAway}|${timeKey}`;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...g, source });
      } else {
        const preferLine = g.total !== undefined && existing.total === undefined;
        const preferLogos = (g.homeLogo || g.awayLogo) && (!existing.homeLogo && !existing.awayLogo);
        
        if (preferLine || preferLogos) {
          map.set(key, {
            ...existing,
            total: g.total ?? existing.total,
            numBooks: g.numBooks ?? existing.numBooks,
            booksStd: g.booksStd ?? existing.booksStd,
            homeLogo: g.homeLogo ?? existing.homeLogo,
            awayLogo: g.awayLogo ?? existing.awayLogo,
            homeId: g.homeId ?? existing.homeId,
            awayId: g.awayId ?? existing.awayId,
            venue: g.venue ?? existing.venue,
            source: 'merged' as const,
          });
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => 
    new Date(a.commenceTimeUTC).getTime() - new Date(b.commenceTimeUTC).getTime()
  );
}

export async function fetchUpcomingGames(sport: Sport, isoDate: string): Promise<Game[]> {
  const sources = SOURCE_POLICY[sport] || ['oddsapi'];
  const results: { games: RawGame[]; source: 'oddsapi' | 'espn' }[] = [];

  if (DEV) console.log(`[${sport}] ====== Fetching games for ${isoDate} ======`);
  if (DEV) console.log(`[${sport}] Source policy: ${sources.join(' → ')}`);

  for (const src of sources) {
    const games = src === 'oddsapi'
      ? await fetchFromOddsAPI(sport, isoDate)
      : await fetchFromESPN(sport, isoDate);
    
    results.push({ games, source: src });
  }

  const merged = dedupeAndMerge(results);

  if (DEV) {
    console.log(`[${sport}] ✓ Final: ${merged.length} games (sources: ${results.map(r => `${r.source}=${r.games.length}`).join(', ')})`);
    merged.forEach(g => {
      console.log(`  [${g.source}] ${g.away} @ ${g.home}, Line: ${g.total ?? 'none'}, Books: ${g.numBooks ?? 0}`);
    });
  }

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
  const api = SPORT_API_PATHS[sport];
  if (!api) return [];

  const collected: any[] = [];
  let cursor = new Date(fromIsoDate);

  if (DEV) console.log(`[Backfill] Team ${teamId} from ${fromIsoDate}`);

  for (let i = 0; i < 20 && collected.length < maxGames; i++) {
    cursor.setDate(cursor.getDate() - 1);
    const iso = cursor.toISOString().slice(0, 10);

    try {
      const dates = toYyyymmddUTC(iso);
      const path = `/${api.league}/${api.sport}/scoreboard`;
      const res = await fetch(`/api/espn?path=${encodeURIComponent(path)}&dates=${dates}`, {
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
