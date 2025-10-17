export type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB' | 'NCAA_FB' | 'NCAA_BB' | 'SOCCER' | 'TENNIS';

export interface TeamStats {
  teamId: string;
  teamName: string;
  avgPointsScored: number;
  avgPointsAllowed: number;
  pace?: number;
  offensiveEfficiency?: number;
  defensiveEfficiency?: number;
  recentForm: number[];
  gamesPlayed: number;
}

export interface GameContext {
  venue: 'home' | 'away' | 'neutral';
  weather?: WeatherCondition;
  restDays: number;
  injuries: InjuryReport[];
  travelDistance?: number;
}

export interface WeatherCondition {
  temperature?: number;
  conditions: string;
  windSpeed?: number;
  precipitation?: boolean;
  indoor: boolean;
}

export interface InjuryReport {
  playerName: string;
  impact: 'high' | 'medium' | 'low';
  status: 'out' | 'doubtful' | 'questionable';
}

export interface MTOPrediction {
  gameId: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  predictedMTO: number;
  confidence: number;
  sportsbookLine?: number;
  keyFactors: KeyFactor[];
  dataCompleteness: number;
}

export interface KeyFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  description: string;
}

export interface Game {
  id: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  gameDate: string;
  venue: string;
  status: 'scheduled' | 'live' | 'completed';
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  sportsbookLine?: number;
}

export interface CalculationInput {
  homeTeamStats: TeamStats;
  awayTeamStats: TeamStats;
  gameContext: GameContext;
  sport: Sport;
  sportsbookLine?: number;
  leagueAverages: LeagueAverages;
}

export interface LeagueAverages {
  avgTotal: number;
  avgPace?: number;
  avgOffensiveEfficiency?: number;
  avgDefensiveEfficiency?: number;
}
