import { Game, Sport, TeamStats, GameContext, CalculationInput } from '@/types/sports';
import { getLeagueAverages } from './mtoEngine';

const CORS_PROXY = 'https://corsproxy.io/?';
const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

function getProxiedUrl(url: string): string {
  return `${CORS_PROXY}${encodeURIComponent(url)}`;
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
  SOCCER: { league: 'soccer', sport: 'eng.1' },
  TENNIS: null,
};

async function fetchESPNGames(sport: Sport): Promise<ESPNGame[]> {
  const apiPath = SPORT_API_PATHS[sport];
  if (!apiPath) {
    console.log(`No API path configured for ${sport}`);
    return [];
  }

  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    const url = `${ESPN_BASE_URL}/${apiPath.league}/${apiPath.sport}/scoreboard?dates=${dateStr}`;
    console.log(`Fetching ${sport} games from: ${url}`);
    
    const response = await fetch(getProxiedUrl(url), {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`ESPN API error for ${sport}: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    console.log(`ESPN API returned ${data.events?.length || 0} events for ${sport} on ${dateStr}`);
    
    if (!data.events || data.events.length === 0) {
      console.log(`No games today for ${sport}, fetching next 7 days...`);
      const allEvents: ESPNGame[] = [];
      
      for (let i = 1; i <= 7; i++) {
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + i);
        const futureYear = futureDate.getFullYear();
        const futureMonth = String(futureDate.getMonth() + 1).padStart(2, '0');
        const futureDay = String(futureDate.getDate()).padStart(2, '0');
        const futureDateStr = `${futureYear}${futureMonth}${futureDay}`;
        
        const futureUrl = `${ESPN_BASE_URL}/${apiPath.league}/${apiPath.sport}/scoreboard?dates=${futureDateStr}`;
        const futureResponse = await fetch(getProxiedUrl(futureUrl), {
          headers: { 'Accept': 'application/json' },
        });
        
        if (futureResponse.ok) {
          const futureData = await futureResponse.json();
          if (futureData.events && futureData.events.length > 0) {
            console.log(`Found ${futureData.events.length} games for ${sport} on ${futureDateStr}`);
            allEvents.push(...futureData.events);
          }
        }
        
        if (allEvents.length >= 10) break;
      }
      
      return allEvents;
    }
    
    return data.events || [];
  } catch (error) {
    console.error(`Error fetching ${sport} games:`, error);
    return [];
  }
}

function convertESPNGameToGame(espnGame: ESPNGame, sport: Sport): Game | null {
  try {
    const competition = espnGame.competitions[0];
    if (!competition) return null;

    const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

    if (!homeTeam || !awayTeam) return null;

    const status = espnGame.status.type.state === 'pre' ? 'scheduled' :
                   espnGame.status.type.state === 'in' ? 'live' : 'completed';

    let sportsbookLine: number | undefined;
    if (competition.odds && competition.odds.length > 0) {
      const odds = competition.odds[0];
      if (odds.overUnder) {
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
  console.log(`Fetching upcoming games for ${sport}`);
  
  const espnGames = await fetchESPNGames(sport);
  console.log(`Found ${espnGames.length} ESPN games for ${sport}`);
  
  const games = espnGames
    .map(game => convertESPNGameToGame(game, sport))
    .filter((game): game is Game => game !== null)
    .filter(game => game.status === 'scheduled' || game.status === 'live');

  console.log(`Converted to ${games.length} valid games for ${sport}`);
  
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
    const url = `${ESPN_BASE_URL}/${apiPath.league}/${apiPath.sport}/teams/${teamId}/schedule`;
    console.log(`Fetching team schedule from: ${url}`);
    
    const response = await fetch(getProxiedUrl(url), {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch team schedule: ${response.status}`);
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
  
  const [homeRecentStats, awayRecentStats] = await Promise.all([
    fetchRecentAveragesFromSchedule(game.homeTeamId, game.sport, 10),
    fetchRecentAveragesFromSchedule(game.awayTeamId, game.sport, 10)
  ]);
  
  const defaultAvgPerTeam = leagueAverages.avgTotal / 2;
  
  const homeTeamStats: TeamStats = {
    teamId: game.homeTeamId,
    teamName: game.homeTeam,
    avgPointsScored: homeRecentStats?.avgPointsScored ?? defaultAvgPerTeam,
    avgPointsAllowed: homeRecentStats?.avgPointsAllowed ?? defaultAvgPerTeam,
    pace: leagueAverages.avgPace,
    offensiveEfficiency: leagueAverages.avgOffensiveEfficiency,
    defensiveEfficiency: leagueAverages.avgDefensiveEfficiency,
    recentForm: homeRecentStats?.recentForm ?? [],
    gamesPlayed: homeRecentStats?.gamesPlayed ?? 0,
  };
  
  const awayTeamStats: TeamStats = {
    teamId: game.awayTeamId,
    teamName: game.awayTeam,
    avgPointsScored: awayRecentStats?.avgPointsScored ?? defaultAvgPerTeam,
    avgPointsAllowed: awayRecentStats?.avgPointsAllowed ?? defaultAvgPerTeam,
    pace: leagueAverages.avgPace,
    offensiveEfficiency: leagueAverages.avgOffensiveEfficiency,
    defensiveEfficiency: leagueAverages.avgDefensiveEfficiency,
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
