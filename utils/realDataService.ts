import { Game, Sport, TeamStats, GameContext, CalculationInput } from '@/types/sports';
import { getLeagueAverages } from './mtoEngine';

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

function toYyyymmddUTC(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}

async function fetchScoreboard(league: string, sport: string, isoDate: string) {
  const dates = toYyyymmddUTC(isoDate);
  const upstream = `${ESPN_BASE}/${league}/${sport}/scoreboard?dates=${dates}`;
  const json = await fetchJSONViaProxies(upstream);
  
  if (!json || !Array.isArray(json.events)) {
    throw new Error('No events array in response');
  }
  
  return json.events;
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

export async function fetchUpcomingGames(sport: Sport): Promise<Game[]> {
  try {
    const api = SPORT_API_PATHS[sport];
    if (!api) return [];
    
    const today = new Date().toISOString().split('T')[0];
    console.log(`[${sport}] Fetching games for ${today}`);
    
    const events = await fetchScoreboard(api.league, api.sport, today);
    const games = (events || [])
      .map((e: any) => convertESPNGameToGame(e, sport))
      .filter((g): g is Game => !!g)
      .filter((g: Game) => g.status === 'scheduled' || g.status === 'live')
      .sort((a: Game, b: Game) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
    
    console.log(`[${sport}] Converted to ${games.length} valid upcoming games`);
    return games;
  } catch (err) {
    console.error(`[${sport}] ESPN failed:`, err);
    return [];
  }
}

async function fetchRecentAveragesFromSchedule(
  teamId: string,
  sport: Sport,
  n: number = 10
): Promise<{ avgPointsScored: number; avgPointsAllowed: number; gamesPlayed: number; recentForm: number[] } | null> {
  const apiPath = SPORT_API_PATHS[sport];
  if (!apiPath) return null;

  try {
    const upstream = `${ESPN_BASE}/${apiPath.league}/${apiPath.sport}/teams/${teamId}/schedule`;
    console.log(`Fetching team schedule for ${teamId}`);
    
    const data = await fetchJSONViaProxies(upstream);
    
    if (!data.events || data.events.length === 0) {
      console.log(`No schedule events found for team ${teamId}`);
      return null;
    }

    const completedGames: ESPNScheduleEvent[] = data.events
      .filter((event: ESPNScheduleEvent) => {
        const competition = event.competitions?.[0];
        if (!competition) return false;
        
        const hasScores = competition.competitors.every(c => c.score !== undefined && c.score !== '');
        return hasScores;
      })
      .slice(-n);

    if (completedGames.length === 0) {
      console.log(`No completed games found for team ${teamId}`);
      return null;
    }

    const teamStats = completedGames.map(event => {
      const competition = event.competitions![0];
      const teamCompetitor = competition.competitors.find(c => c.team.id === teamId);
      const opponentCompetitor = competition.competitors.find(c => c.team.id !== teamId);

      if (!teamCompetitor || !opponentCompetitor) return null;

      const teamScore = parseFloat(teamCompetitor.score || '0');
      const opponentScore = parseFloat(opponentCompetitor.score || '0');

      return { teamScore, opponentScore };
    }).filter((stat): stat is { teamScore: number; opponentScore: number } => stat !== null);

    if (teamStats.length === 0) {
      console.log(`No valid stats extracted for team ${teamId}`);
      return null;
    }

    const totalPointsScored = teamStats.reduce((sum, stat) => sum + stat.teamScore, 0);
    const totalPointsAllowed = teamStats.reduce((sum, stat) => sum + stat.opponentScore, 0);
    const gamesPlayed = teamStats.length;

    const avgPointsScored = totalPointsScored / gamesPlayed;
    const avgPointsAllowed = totalPointsAllowed / gamesPlayed;
    const recentForm = teamStats.map(stat => stat.teamScore);

    if (isNaN(avgPointsScored) || isNaN(avgPointsAllowed)) {
      console.log(`Invalid averages calculated for team ${teamId}`);
      return null;
    }

    console.log(`Team ${teamId} - Last ${gamesPlayed} games: PPG=${avgPointsScored.toFixed(1)}, PAPG=${avgPointsAllowed.toFixed(1)}`);

    return {
      avgPointsScored,
      avgPointsAllowed,
      gamesPlayed,
      recentForm,
    };
  } catch (error) {
    console.error(`Error fetching team schedule for ${teamId}:`, error);
    return null;
  }
}

export async function fetchGameCalculationInput(game: Game): Promise<CalculationInput> {
  const leagueAverages = getLeagueAverages(game.sport);
  
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
    fetchRecentAveragesFromSchedule(game.homeTeamId, game.sport, 10),
    fetchRecentAveragesFromSchedule(game.awayTeamId, game.sport, 10)
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
