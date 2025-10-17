import { Game, Sport, TeamStats, GameContext, CalculationInput } from '@/types/sports';
import { getLeagueAverages } from './mtoEngine';

const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

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
    
    const response = await fetch(url, {
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
        const futureResponse = await fetch(futureUrl, {
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

    return {
      id: `${sport}-${espnGame.id}`,
      sport,
      homeTeam: homeTeam.team.displayName,
      awayTeam: awayTeam.team.displayName,
      homeTeamId: homeTeam.team.id,
      awayTeamId: awayTeam.team.id,
      gameDate: espnGame.date,
      venue: competition.venue?.fullName || 'TBD',
      status,
      homeTeamLogo: homeTeam.team.logo,
      awayTeamLogo: awayTeam.team.logo,
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

async function fetchTeamStatsFromESPN(teamId: string, sport: Sport): Promise<Partial<TeamStats> | null> {
  const apiPath = SPORT_API_PATHS[sport];
  if (!apiPath) return null;

  try {
    const url = `${ESPN_BASE_URL}/${apiPath.league}/${apiPath.sport}/teams/${teamId}/statistics`;
    const response = await fetch(url);
    
    if (!response.ok) return null;

    const data = await response.json();
    
    const ppg = data.stats?.find((s: any) => s.name === 'pointsPerGame' || s.name === 'avgPointsPerGame')?.value;
    const papg = data.stats?.find((s: any) => s.name === 'pointsAllowedPerGame' || s.name === 'avgPointsAllowedPerGame')?.value;

    return {
      avgPointsScored: ppg ? parseFloat(ppg) : undefined,
      avgPointsAllowed: papg ? parseFloat(papg) : undefined,
    };
  } catch (error) {
    console.error(`Error fetching team stats for ${teamId}:`, error);
    return null;
  }
}

function generateRecentForm(avg: number, variance: number, games: number): number[] {
  return Array.from({ length: games }, () => 
    Math.max(0, avg + (Math.random() - 0.5) * variance * 2)
  );
}

function generateTeamStats(sport: Sport, teamName: string, teamId: string): TeamStats {
  const leagueAvg = getLeagueAverages(sport);
  const avgPerTeam = leagueAvg.avgTotal / 2;
  
  const variance = avgPerTeam * 0.3;
  const avgScored = avgPerTeam + (Math.random() - 0.5) * variance * 2;
  const avgAllowed = avgPerTeam + (Math.random() - 0.5) * variance * 2;
  
  return {
    teamId,
    teamName,
    avgPointsScored: avgScored,
    avgPointsAllowed: avgAllowed,
    pace: leagueAvg.avgPace ? leagueAvg.avgPace * (0.85 + Math.random() * 0.3) : undefined,
    offensiveEfficiency: leagueAvg.avgOffensiveEfficiency ? 
      leagueAvg.avgOffensiveEfficiency * (0.8 + Math.random() * 0.4) : undefined,
    defensiveEfficiency: leagueAvg.avgDefensiveEfficiency ?
      leagueAvg.avgDefensiveEfficiency * (0.8 + Math.random() * 0.4) : undefined,
    recentForm: generateRecentForm(avgScored, variance, 10),
    gamesPlayed: Math.floor(5 + Math.random() * 25)
  };
}

function generateGameContext(sport: Sport): GameContext {
  const hasWeather = ['NFL', 'MLB', 'SOCCER', 'NCAA_FB'].includes(sport);
  const indoor = Math.random() > 0.6;
  
  const injuries = Math.random() > 0.6 ? [
    {
      playerName: 'Key Player',
      impact: Math.random() > 0.5 ? 'high' as const : 'medium' as const,
      status: Math.random() > 0.5 ? 'out' as const : 'questionable' as const
    }
  ] : [];

  return {
    venue: Math.random() > 0.5 ? 'home' : 'away',
    weather: hasWeather ? {
      temperature: 40 + Math.random() * 45,
      conditions: indoor ? 'Indoor' : (Math.random() > 0.7 ? 'Rain' : 'Clear'),
      windSpeed: indoor ? 0 : Math.random() * 25,
      precipitation: !indoor && Math.random() > 0.8,
      indoor
    } : undefined,
    restDays: Math.floor(Math.random() * 5),
    injuries,
    travelDistance: Math.random() * 3000
  };
}

export async function fetchGameCalculationInput(game: Game): Promise<CalculationInput> {
  const homeTeamStats = generateTeamStats(game.sport, game.homeTeam, game.homeTeamId);
  const awayTeamStats = generateTeamStats(game.sport, game.awayTeam, game.awayTeamId);
  const gameContext = generateGameContext(game.sport);
  const leagueAverages = getLeagueAverages(game.sport);
  
  const hasSportsbookLine = Math.random() > 0.2;
  const sportsbookLine = hasSportsbookLine ? 
    leagueAverages.avgTotal + (Math.random() - 0.5) * 20 : undefined;
  
  return {
    homeTeamStats,
    awayTeamStats,
    gameContext,
    sport: game.sport,
    sportsbookLine,
    leagueAverages
  };
}
