import { Game, Sport, TeamStats, GameContext, CalculationInput } from '@/types/sports';
import { getLeagueAverages } from './mtoEngine';
import * as mockDataService from './mockDataService';

const ESPN_BASES = [
  'https://site.api.espn.com/apis/site/v2/sports',
  'https://sports.core.api.espn.com/v2/sports',
  'https://site.web.api.espn.com/apis/site/v2/sports'
];

async function tryFetch(path: string): Promise<Response | null> {
  for (let attempt = 0; attempt < ESPN_BASES.length; attempt++) {
    const base = ESPN_BASES[attempt];
    try {
      const fullUrl = `${base}${path}`;
      const proxyUrl = `/api/fetch?url=${encodeURIComponent(fullUrl)}`;
      
      console.log(`[realDataService] Attempt ${attempt + 1}/${ESPN_BASES.length}: ${fullUrl}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(proxyUrl, {
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
          cache: 'no-store',
        });
        
        clearTimeout(timeout);
        console.log(`[realDataService] Proxy response status: ${response.status}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.log(`✗ Non-200 response from ${base}: ${response.status}`, errorData);
          continue;
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.log(`✗ Non-JSON response from ${base}`);
          continue;
        }
        
        try {
          const clonedResponse = response.clone();
          const testData = await clonedResponse.json();
          
          if (testData.error) {
            console.log(`✗ Proxy returned error from ${base}:`, testData.error);
            continue;
          }
          
          if (testData.events !== undefined || testData.team !== undefined) {
            console.log(`✓ Success with base: ${base}`);
            return response;
          } else {
            console.log(`✗ Unexpected response structure from ${base}`);
          }
        } catch (e) {
          console.log(`✗ Invalid JSON from ${base}:`, e);
        }
      } catch (error: any) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
          console.log(`✗ Request timeout with ${base}`);
        } else {
          console.log(`✗ Network error with base ${base}:`, error);
        }
      }
    } catch (error) {
      console.log(`✗ Unexpected error with base ${base}:`, error);
    }
  }
  
  console.error(`[realDataService] All ${ESPN_BASES.length} base URLs failed for path: ${path}`);
  return null;
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

function formatDateYYYYMMDD(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

let espnApiFailing = false;
let lastEspnCheck = 0;
const ESPN_CHECK_INTERVAL = 60000;

async function fetchESPNGames(sport: Sport): Promise<ESPNGame[]> {
  const apiPath = SPORT_API_PATHS[sport];
  if (!apiPath) {
    console.log(`No API path configured for ${sport}`);
    return [];
  }

  const now = Date.now();
  if (espnApiFailing && now - lastEspnCheck < ESPN_CHECK_INTERVAL) {
    console.log(`Skipping ESPN API (known to be failing, retry in ${Math.round((ESPN_CHECK_INTERVAL - (now - lastEspnCheck)) / 1000)}s)`);
    return [];
  }

  try {
    const today = new Date();
    const dateStr = formatDateYYYYMMDD(today);
    
    console.log(`[${sport}] Attempting to fetch games for ${dateStr}`);
    
    let response = await tryFetch(`/${apiPath.league}/${apiPath.sport}/scoreboard?dates=${dateStr}`);
    
    if (!response) {
      console.log(`[${sport}] Date param failed, trying without dates...`);
      response = await tryFetch(`/${apiPath.league}/${apiPath.sport}/scoreboard`);
    }
    
    if (!response) {
      console.log(`[${sport}] Scoreboard failed, trying news endpoint...`);
      response = await tryFetch(`/${apiPath.league}/${apiPath.sport}/news`);
    }
    
    if (!response) {
      console.error(`[${sport}] All ESPN API attempts failed - falling back to mock data`);
      espnApiFailing = true;
      lastEspnCheck = now;
      return [];
    }

    espnApiFailing = false;
    const data = await response.json();
    console.log(`[${sport}] ESPN API returned ${data.events?.length || 0} events`);
    
    if (!data.events || data.events.length === 0) {
      console.log(`[${sport}] No games found for today, trying next 7 days...`);
      const allEvents: ESPNGame[] = [];
      
      for (let i = 1; i <= 7; i++) {
        const futureDate = new Date(today);
        futureDate.setUTCDate(futureDate.getUTCDate() + i);
        const futureDateStr = formatDateYYYYMMDD(futureDate);
        
        const futureResponse = await tryFetch(`/${apiPath.league}/${apiPath.sport}/scoreboard?dates=${futureDateStr}`);
        
        if (futureResponse) {
          const futureData = await futureResponse.json();
          if (futureData.events && futureData.events.length > 0) {
            console.log(`[${sport}] Found ${futureData.events.length} games on ${futureDateStr}`);
            allEvents.push(...futureData.events);
          }
        }
        
        if (allEvents.length >= 10) break;
      }
      
      return allEvents;
    }
    
    return data.events || [];
  } catch (error) {
    console.error(`[${sport}] Error fetching games:`, error);
    espnApiFailing = true;
    lastEspnCheck = now;
    return [];
  }
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
  console.log(`[${sport}] Starting fetchUpcomingGames...`);
  
  const espnGames = await fetchESPNGames(sport);
  console.log(`[${sport}] ESPN returned ${espnGames.length} games`);
  
  const games = espnGames
    .map(game => convertESPNGameToGame(game, sport))
    .filter((game): game is Game => game !== null)
    .filter(game => game.status === 'scheduled' || game.status === 'live');

  console.log(`[${sport}] Converted to ${games.length} valid upcoming games`);
  
  if (games.length === 0) {
    console.warn(`[${sport}] No ESPN data available - using mock data for demonstration`);
    return mockDataService.fetchUpcomingGames(sport);
  }
  
  return games.sort((a, b) => 
    new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime()
  );
}

async function fetchRecentAveragesFromSchedule(
  teamId: string,
  sport: Sport,
  n: number = 10
): Promise<{ avgPointsScored: number; avgPointsAllowed: number; gamesPlayed: number; recentForm: number[] } | null> {
  const apiPath = SPORT_API_PATHS[sport];
  if (!apiPath) return null;

  try {
    const path = `/${apiPath.league}/${apiPath.sport}/teams/${teamId}/schedule`;
    console.log(`Fetching team schedule for ${teamId}`);
    
    const response = await tryFetch(path);
    
    if (!response) {
      console.log(`Failed to fetch team schedule for ${teamId}`);
      return null;
    }

    const data = await response.json();
    
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
  
  if (espnApiFailing || !game.homeTeamId || !game.awayTeamId) {
    console.warn('ESPN API unavailable or missing team IDs, using mock data for calculation input');
    return mockDataService.fetchGameCalculationInput(game);
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
