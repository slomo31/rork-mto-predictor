import { Game, Sport, TeamStats, GameContext, CalculationInput } from '@/types/sports';
import { getLeagueAverages } from './mtoEngine';

const TEAM_NAMES = {
  NFL: ['Chiefs', 'Bills', '49ers', 'Eagles', 'Cowboys', 'Bengals', 'Ravens', 'Dolphins'],
  NBA: ['Lakers', 'Celtics', 'Warriors', 'Bucks', 'Nuggets', 'Suns', 'Heat', 'Mavericks'],
  NHL: ['Bruins', 'Avalanche', 'Lightning', 'Rangers', 'Maple Leafs', 'Oilers', 'Panthers', 'Stars'],
  MLB: ['Dodgers', 'Yankees', 'Braves', 'Astros', 'Phillies', 'Padres', 'Blue Jays', 'Mets'],
  NCAA_FB: ['Alabama', 'Georgia', 'Ohio State', 'Michigan', 'Texas', 'USC', 'Penn State', 'Oregon'],
  NCAA_BB: ['Duke', 'UNC', 'Kansas', 'Kentucky', 'Gonzaga', 'UCLA', 'Villanova', 'Arizona'],
  SOCCER: ['Man City', 'Real Madrid', 'Bayern', 'PSG', 'Liverpool', 'Barcelona', 'Chelsea', 'Juventus'],
  TENNIS: ['Djokovic', 'Alcaraz', 'Medvedev', 'Sinner', 'Rublev', 'Tsitsipas', 'Zverev', 'Rune']
};

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateRecentForm(avg: number, variance: number, games: number): number[] {
  return Array.from({ length: games }, () => 
    Math.max(0, avg + (Math.random() - 0.5) * variance * 2)
  );
}

function generateTeamStats(sport: Sport, teamName: string): TeamStats {
  const leagueAvg = getLeagueAverages(sport);
  const avgPerTeam = leagueAvg.avgTotal / 2;
  
  const variance = avgPerTeam * 0.3;
  const avgScored = randomInRange(avgPerTeam - variance, avgPerTeam + variance);
  const avgAllowed = randomInRange(avgPerTeam - variance, avgPerTeam + variance);
  
  return {
    teamId: `${sport}-${teamName.toLowerCase().replace(/\s+/g, '-')}`,
    teamName,
    avgPointsScored: avgScored,
    avgPointsAllowed: avgAllowed,
    pace: leagueAvg.avgPace ? randomInRange(leagueAvg.avgPace * 0.85, leagueAvg.avgPace * 1.15) : undefined,
    offensiveEfficiency: leagueAvg.avgOffensiveEfficiency ? 
      randomInRange(leagueAvg.avgOffensiveEfficiency * 0.8, leagueAvg.avgOffensiveEfficiency * 1.2) : undefined,
    defensiveEfficiency: leagueAvg.avgDefensiveEfficiency ?
      randomInRange(leagueAvg.avgDefensiveEfficiency * 0.8, leagueAvg.avgDefensiveEfficiency * 1.2) : undefined,
    recentForm: generateRecentForm(avgScored, variance, 10),
    gamesPlayed: Math.floor(randomInRange(5, 30))
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
      temperature: randomInRange(40, 85),
      conditions: indoor ? 'Indoor' : (Math.random() > 0.7 ? 'Rain' : 'Clear'),
      windSpeed: indoor ? 0 : randomInRange(0, 25),
      precipitation: !indoor && Math.random() > 0.8,
      indoor
    } : undefined,
    restDays: Math.floor(randomInRange(0, 5)),
    injuries,
    travelDistance: randomInRange(0, 3000)
  };
}

export async function fetchUpcomingGames(sport: Sport): Promise<Game[]> {
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const teams = TEAM_NAMES[sport];
  const games: Game[] = [];
  const gamesCount = sport === 'MLB' ? 15 : sport === 'NBA' ? 12 : 8;
  
  for (let i = 0; i < gamesCount; i++) {
    const homeIdx = Math.floor(Math.random() * teams.length);
    let awayIdx = Math.floor(Math.random() * teams.length);
    while (awayIdx === homeIdx) {
      awayIdx = Math.floor(Math.random() * teams.length);
    }
    
    const date = new Date();
    date.setDate(date.getDate() + Math.floor(i / 4));
    
    games.push({
      id: `${sport}-game-${i}`,
      sport,
      homeTeam: teams[homeIdx],
      awayTeam: teams[awayIdx],
      homeTeamId: `${sport}-${teams[homeIdx].toLowerCase()}`,
      awayTeamId: `${sport}-${teams[awayIdx].toLowerCase()}`,
      gameDate: date.toISOString(),
      venue: `${teams[homeIdx]} Stadium`,
      status: 'scheduled'
    });
  }
  
  return games;
}

export async function fetchGameCalculationInput(game: Game): Promise<CalculationInput> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const homeTeamStats = generateTeamStats(game.sport, game.homeTeam);
  const awayTeamStats = generateTeamStats(game.sport, game.awayTeam);
  const gameContext = generateGameContext(game.sport);
  const leagueAverages = getLeagueAverages(game.sport);
  
  const hasSportsbookLine = Math.random() > 0.2;
  const sportsbookLine = hasSportsbookLine ? 
    leagueAverages.avgTotal + randomInRange(-10, 10) : undefined;
  
  return {
    homeTeamStats,
    awayTeamStats,
    gameContext,
    sport: game.sport,
    sportsbookLine,
    leagueAverages
  };
}
