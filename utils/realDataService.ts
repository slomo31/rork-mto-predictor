import { Game, Sport, TeamStats, GameContext, CalculationInput } from '@/types/sports';
import { getLeagueAverages } from './mtoEngine';
import { getFixturesForDate, extractConsensusTotal, type OddsFixture } from '@/utils/OddsService';
import { toYyyymmddUTC, isISOWithinLocalDate } from '@/utils/date';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

const CORS_PROXIES = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://cors.isomorphic-git.org/${u}`,
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`
];

async function fetchJSONViaProxies(upstreamUrl: string) {
  let lastErr: any;
  
  for (const wrap of CORS_PROXIES) {
    const proxyUrl = wrap(upstreamUrl);
    console.log(`[realDataService] Trying proxy for: ${upstreamUrl}`);
    
    try {
      const r = await fetch(proxyUrl, {
        headers: { accept: 'application/json' },
        cache: 'no-store'
      });
      
      const text = await r.text();
      const isJson =
        (r.headers.get('content-type') || '').includes('application/json') ||
        text.trim().startsWith('{') ||
        text.trim().startsWith('[');
      
      if (!r.ok) {
        console.warn(`[realDataService] Proxy returned status ${r.status}`);
        lastErr = new Error(`status ${r.status}`);
        continue;
      }
      
      if (!isJson) {
        console.warn('[realDataService] Response is not JSON');
        lastErr = new Error('not json');
        continue;
      }
      
      const json = JSON.parse(text);
      console.log(`✓ Success via proxy`);
      return json;
    } catch (e: any) {
      console.warn(`[realDataService] Proxy attempt failed:`, e.message);
      lastErr = e;
    }
  }
  
  throw lastErr || new Error('All CORS proxies failed');
}

interface ESPNGame {
  id: string;
  date: string;
  status: {
    type: {
      name: string;
      state: string;
    };
  };
  competitions: Array<{
    id: string;
    venue: {
      fullName: string;
    };
    competitors: Array<{
      id: string;
      team: {
        id: string;
        displayName: string;
        abbreviation: string;
        logo: string;
      };
      homeAway: 'home' | 'away';
      statistics?: Array<{
        name: string;
        displayValue: string;
      }>;
      records?: Array<{
        type: string;
        summary: string;
      }>;
    }>;
    odds?: Array<{
      details: string;
      overUnder: number;
    }>;
  }>;
}

interface ESPNScheduleEvent {
  id: string;
  date: string;
  competitions?: Array<{
    competitors: Array<{
      id: string;
      score?: string;
      homeAway: 'home' | 'away';
      team: {
        id: string;
        displayName: string;
      };
    }>;
  }>;
}

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

async function fetchScoreboardEvents(league: string, sport: string, isoDate: string) {
  const dates = toYyyymmddUTC(isoDate);
  const upstream = `${ESPN_BASE}/${league}/${sport}/scoreboard?dates=${dates}`;
  console.log(`[fetchScoreboardEvents] Fetching: ${upstream}`);
  const json = await fetchJSONViaProxies(upstream);
  
  if (!json || !Array.isArray(json.events)) {
    console.log(`[fetchScoreboardEvents] No events array in response for ${league}/${sport}`);
    return [];
  }
  
  console.log(`[fetchScoreboardEvents] Got ${json.events.length} events from ESPN`);
  return json.events;
}

function filterToLocalDay(events: any[], isoDate: string) {
  console.log(`[filterToLocalDay] Filtering ${events.length} events for date ${isoDate}`);
  const filtered = (events || []).filter(ev => {
    const dt = ev?.date ?? ev?.competitions?.[0]?.date;
    if (!dt) {
      console.log(`[filterToLocalDay] Event missing date, keeping it`);
      return true;
    }
    const withinDay = isISOWithinLocalDate(dt, isoDate);
    if (!withinDay) {
      console.log(`[filterToLocalDay] Filtering out: ${dt} not within ${isoDate}`);
    } else {
      console.log(`[filterToLocalDay] Keeping: ${dt} within ${isoDate}`);
    }
    return withinDay;
  });
  console.log(`[filterToLocalDay] Result: ${filtered.length} of ${events.length} events kept`);
  return filtered;
}

function convertESPNGameToGame(espnGame: ESPNGame, sport: Sport): Game | null {
  try {
    const competition = espnGame.competitions[0];
    if (!competition) {
      console.log('No competition data in event');
      return null;
    }

    const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

    if (!homeTeam || !awayTeam) {
      console.log('Missing home or away team');
      return null;
    }

    if (!homeTeam.team.id || !awayTeam.team.id) {
      console.log('Missing team IDs');
      return null;
    }

    const status = espnGame.status.type.state === 'pre' ? 'scheduled' :
                   espnGame.status.type.state === 'in' ? 'live' : 'completed';

    let sportsbookLine: number | undefined;
    if (competition.odds && competition.odds.length > 0) {
      const odds = competition.odds[0];
      if (odds.overUnder && !isNaN(odds.overUnder)) {
        sportsbookLine = odds.overUnder;
        console.log(`Found real sportsbook line for ${homeTeam.team.displayName} vs ${awayTeam.team.displayName}: ${sportsbookLine}`);
      }
    }

    return {
      id: `${sport}-${espnGame.id}`,
      sport,
      homeTeam: homeTeam.team.displayName,
      awayTeam: awayTeam.team.displayName,
      homeTeamId: homeTeam.team.id,
      awayTeamId: awayTeam.team.id,
      gameDate: espnGame.date || new Date().toISOString(),
      venue: competition.venue?.fullName || 'TBD',
      status,
      homeTeamLogo: homeTeam.team.logo || undefined,
      awayTeamLogo: awayTeam.team.logo || undefined,
      sportsbookLine,
    };
  } catch (error) {
    console.error('Error converting ESPN game:', error);
    return null;
  }
}

export async function fetchUpcomingGames(sport: Sport, isoDate: string): Promise<Game[]> {
  const api = SPORT_API_PATHS[sport];
  if (!api) {
    console.log(`[${sport}] No API path configured`);
    return [];
  }
  
  console.log(`[${sport}] ====== Fetching games for ${isoDate} ======`);
  
  try {
    const rawEvents = await fetchScoreboardEvents(api.league, api.sport, isoDate);
    const events = filterToLocalDay(rawEvents, isoDate);
    const games = (events || [])
      .map((e: any) => convertESPNGameToGame(e, sport))
      .filter((g: any): g is Game => !!g)
      .filter((g: Game) => g.status === 'scheduled' || g.status === 'live')
      .sort((a: Game, b: Game) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
    
    if (games.length > 0) {
      console.log(`[${sport}] ✓ ESPN success: ${games.length} games`);
      games.forEach(g => {
        console.log(`  - ${g.awayTeam} @ ${g.homeTeam}, Line: ${g.sportsbookLine ?? 'none'}`);
      });
      return games;
    }
    console.log(`[${sport}] ESPN returned 0 games after filtering`);
  } catch (err) {
    console.warn(`[${sport}] ESPN failed, trying OddsAPI fallback:`, err);
  }
  
  const oddsKey = ODDSAPI_SPORT_KEYS[sport];
  if (!oddsKey) {
    console.log(`[${sport}] No OddsAPI key available for fallback`);
    return [];
  }
  
  console.log(`[${sport}] Trying OddsAPI fallback with key: ${oddsKey}`);
  try {
    const fixtures = await getFixturesForDate(oddsKey, isoDate);
    console.log(`[${sport}] OddsAPI returned ${fixtures.length} fixtures`);
    
    fixtures.forEach(f => {
      console.log(`  Raw fixture: ${f.away_team} @ ${f.home_team} at ${f.commence_time}`);
    });
    
    const gamesFromOdds: Game[] = fixtures
      .map((f: OddsFixture, idx: number) => {
        const sportsbookLine = extractConsensusTotal(f);
        const gameDate = new Date(f.commence_time);
        const gameDateStr = gameDate.toISOString();
        
        console.log(`  Mapping: ${f.away_team} @ ${f.home_team}, Date: ${gameDateStr}, Line: ${sportsbookLine ?? 'none'}`);
        
        return {
          id: `${sport}-odds-${f.id || idx}`,
          sport,
          homeTeam: f.home_team,
          awayTeam: f.away_team,
          homeTeamId: f.home_team,
          awayTeamId: f.away_team,
          gameDate: gameDateStr,
          venue: 'TBD',
          status: 'scheduled' as const,
          homeTeamLogo: undefined,
          awayTeamLogo: undefined,
          sportsbookLine,
        };
      }).sort((a: Game, b: Game) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
    
    console.info(`[${sport}] ✓ OddsAPI fallback: ${gamesFromOdds.length} games total`);
    return gamesFromOdds;
  } catch (e) {
    console.error(`[${sport}] OddsAPI fallback failed:`, e);
    return [];
  }
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

  console.log(`[Scoreboard Backfill] Fetching ${maxGames} recent games for team ${teamId} from ${fromIsoDate}`);

  for (let i = 0; i < 20 && collected.length < maxGames; i++) {
    cursor.setDate(cursor.getDate() - 1);
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;

    try {
      const events = await fetchScoreboardEvents(api.league, api.sport, iso);

      for (const ev of events) {
        const comp = ev?.competitions?.[0];
        if (!comp) continue;

        const teamHit = (comp.competitors || []).find((c: any) => c.team?.id === teamId);
        if (!teamHit) continue;

        const done = ev?.status?.type?.state === 'post' || comp.status?.type?.state === 'post';
        const scoreA = comp.competitors?.[0]?.score;
        const scoreB = comp.competitors?.[1]?.score;

        if (done && scoreA != null && scoreB != null) {
          collected.push(ev);
          if (collected.length >= maxGames) break;
        }
      }
    } catch (e) {
      console.warn(`[Scoreboard Backfill] Failed for date ${iso}:`, e);
    }
  }

  console.log(`[Scoreboard Backfill] Found ${collected.length} completed games for team ${teamId}`);
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
      console.log(`No completed games found for team ${teamId}`);
      return null;
    }

    let ptsFor = 0;
    let ptsAgainst = 0;
    const recentForm: number[] = [];

    for (const ev of recent) {
      const comp = ev.competitions[0];
      const a = comp.competitors[0];
      const b = comp.competitors[1];

      const isHome = a.team?.id === teamId ? a : b;
      const opp = a.team?.id === teamId ? b : a;

      const teamScore = Number(isHome?.score ?? 0);
      const oppScore = Number(opp?.score ?? 0);

      ptsFor += teamScore;
      ptsAgainst += oppScore;
      recentForm.push(teamScore);
    }

    const gp = recent.length;
    const avgPointsScored = ptsFor / gp;
    const avgPointsAllowed = ptsAgainst / gp;

    if (isNaN(avgPointsScored) || isNaN(avgPointsAllowed)) {
      console.log(`Invalid averages calculated for team ${teamId}`);
      return null;
    }

    console.log(`Team ${teamId} - Last ${gp} games: PPG=${avgPointsScored.toFixed(1)}, PAPG=${avgPointsAllowed.toFixed(1)}`);

    return {
      avgPointsScored,
      avgPointsAllowed,
      gamesPlayed: gp,
      recentForm
    };
  } catch (error) {
    console.error(`Error fetching team stats via scoreboard backfill for ${teamId}:`, error);
    return null;
  }
}

export async function fetchGameCalculationInput(game: Game, isoDate?: string): Promise<CalculationInput> {
  const leagueAverages = getLeagueAverages(game.sport);
  const dateForBackfill = isoDate || new Date().toISOString().slice(0, 10);
  
  console.log(`Fetching calculation input for ${game.awayTeam} @ ${game.homeTeam}`);
  
  if (!game.homeTeamId || !game.awayTeamId) {
    console.warn('Missing team IDs, using league averages');
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

  if (homeRecentStats) {
    console.log(`Using REAL stats for home team ${game.homeTeam}: PPG=${homeTeamStats.avgPointsScored.toFixed(1)}, PAPG=${homeTeamStats.avgPointsAllowed.toFixed(1)}`);
  } else {
    console.log(`Using league average fallback for home team ${game.homeTeam}: ${defaultAvgPerTeam.toFixed(1)}`);
  }
  
  if (awayRecentStats) {
    console.log(`Using REAL stats for away team ${game.awayTeam}: PPG=${awayTeamStats.avgPointsScored.toFixed(1)}, PAPG=${awayTeamStats.avgPointsAllowed.toFixed(1)}`);
  } else {
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
  if (sportsbookLine) {
    console.log(`Using REAL sportsbook line: ${sportsbookLine}`);
  } else {
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
