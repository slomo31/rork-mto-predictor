import { CalculationInput, KeyFactor, MTOPrediction, Sport } from '@/types/sports';
import { getOddsForGame } from './OddsService';

const DEV = process.env.NODE_ENV !== 'production';

const FLOOR_Q: Record<Sport, number> = {
  NCAA_FB: 0.03,
  NFL: 0.05,
  NBA: 0.05,
  NCAA_BB: 0.05,
  NHL: 0.05,
  MLB: 0.05,
  SOCCER: 0.05,
  TENNIS: 0.05
};

const Z_SCORE: Record<number, number> = {
  0.05: 1.645,
  0.025: 1.96,
  0.03: 1.88
};

const SIGMA_BOUNDS: Record<Sport, { min: number; max: number }> = {
  NCAA_FB: { min: 6, max: 15 },
  NFL: { min: 5, max: 10 },
  NBA: { min: 7, max: 14 },
  NCAA_BB: { min: 6, max: 12 },
  NHL: { min: 2.0, max: 4.0 },
  MLB: { min: 2.0, max: 4.0 },
  SOCCER: { min: 1.5, max: 3.0 },
  TENNIS: { min: 1.0, max: 2.0 }
};

const MARKET_FLOOR_CAP = 0.80;
const MAX_MARKET_WEIGHT = 0.10;

const LOW_TEMPO_CONFERENCES = [
  'Big Ten',
  'B1G',
  'Big 10',
  'Wisconsin',
  'Iowa',
  'Northwestern',
  'Penn State',
  'Army',
  'Navy',
  'Air Force'
];

const SPORT_TO_ODDS_KEY: Record<Sport, string> = {
  NFL: 'americanfootball_nfl',
  NCAA_FB: 'americanfootball_ncaaf',
  NBA: 'basketball_nba',
  NCAA_BB: 'basketball_ncaab',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  SOCCER: 'soccer_epl',
  TENNIS: 'tennis_atp'
};

function getZScore(q: number): number {
  return Z_SCORE[q] ?? 1.645;
}

function isLowTempoConf(sport: Sport, conf?: string): boolean {
  if (sport !== 'NCAA_FB') return false;
  if (!conf) return false;
  return LOW_TEMPO_CONFERENCES.some(c => conf.toLowerCase().includes(c.toLowerCase()));
}

function computeConservativeCenter(input: CalculationInput): number {
  const { homeTeamStats, awayTeamStats, leagueAverages } = input;

  const homeAvgScored = homeTeamStats.avgPointsScored || leagueAverages.avgTotal / 2;
  const awayAvgScored = awayTeamStats.avgPointsScored || leagueAverages.avgTotal / 2;
  const homeAvgAllowed = homeTeamStats.avgPointsAllowed || leagueAverages.avgTotal / 2;
  const awayAvgAllowed = awayTeamStats.avgPointsAllowed || leagueAverages.avgTotal / 2;

  const homeRecentAvg = homeTeamStats.recentForm.length > 0
    ? homeTeamStats.recentForm.slice(-5).reduce((sum, val) => sum + val, 0) / Math.min(5, homeTeamStats.recentForm.length)
    : homeAvgScored;

  const awayRecentAvg = awayTeamStats.recentForm.length > 0
    ? awayTeamStats.recentForm.slice(-5).reduce((sum, val) => sum + val, 0) / Math.min(5, awayTeamStats.recentForm.length)
    : awayAvgScored;

  const homeExpectedOffense = homeRecentAvg * 0.5 + homeAvgScored * 0.5;
  const awayExpectedOffense = awayRecentAvg * 0.5 + awayAvgScored * 0.5;

  const homeScoreVsAwayDef = homeExpectedOffense * 0.5 + awayAvgAllowed * 0.5;
  const awayScoreVsHomeDef = awayExpectedOffense * 0.5 + homeAvgAllowed * 0.5;

  let mu = homeScoreVsAwayDef * 0.45 + awayScoreVsHomeDef * 0.45;

  if (homeTeamStats.pace && awayTeamStats.pace && leagueAverages.avgPace) {
    const avgPace = (homeTeamStats.pace + awayTeamStats.pace) / 2;
    const paceAdjustment = (avgPace - leagueAverages.avgPace) / leagueAverages.avgPace;
    mu += mu * paceAdjustment * 0.10;
  }

  return mu;
}

function baseSigmaFromSport(sport: Sport, input: CalculationInput): number {
  const { homeTeamStats, awayTeamStats } = input;

  const homeFormStdDev = calculateStdDev(homeTeamStats.recentForm);
  const awayFormStdDev = calculateStdDev(awayTeamStats.recentForm);

  const totalStdDev = Math.sqrt(homeFormStdDev * homeFormStdDev + awayFormStdDev * awayFormStdDev);

  if (totalStdDev > 0) return totalStdDev;

  const defaultSigmaPercentage: Record<Sport, number> = {
    NCAA_FB: 0.20,
    NFL: 0.18,
    NBA: 0.15,
    NCAA_BB: 0.18,
    NHL: 0.30,
    MLB: 0.25,
    SOCCER: 0.35,
    TENNIS: 0.30
  };

  const pct = defaultSigmaPercentage[sport] ?? 0.18;
  return (input.homeTeamStats.avgPointsScored + input.awayTeamStats.avgPointsScored) * pct;
}

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

export async function calculateMTO(
  input: CalculationInput,
  homeTeamName?: string,
  awayTeamName?: string,
  opts?: { selectedDate?: string }
): Promise<MTOPrediction> {
  const {
    homeTeamStats,
    awayTeamStats,
    gameContext,
    sport,
    sportsbookLine,
    leagueAverages
  } = input;

  const keyFactors: KeyFactor[] = [];
  const notes: string[] = [];
  let dataCompleteness = 1.0;

  let mu = computeConservativeCenter(input);
  let sigma = baseSigmaFromSport(sport, input);

  keyFactors.push({
    factor: 'Team Scoring Trends',
    impact: mu > leagueAverages.avgTotal ? 'positive' : 'negative',
    weight: 0.45,
    description: `Model center: ${mu.toFixed(1)} vs league ${leagueAverages.avgTotal.toFixed(1)}`
  });

  if (isLowTempoConf(sport, gameContext.conference)) {
    sigma *= 1.20;
    mu -= 3;
    notes.push('conf-pace');
    keyFactors.push({
      factor: 'Low Tempo Conference',
      impact: 'negative',
      weight: 0.20,
      description: `${gameContext.conference} (low pace) - reduced μ, inflated σ`
    });
  }

  if (gameContext.weather && !gameContext.weather.indoor) {
    const temp = gameContext.weather.temperature ?? 70;
    const wind = gameContext.weather.windSpeed ?? 0;
    const rain = gameContext.weather.rain || gameContext.weather.precipitation;

    if (wind >= 12 || temp <= 45 || rain) {
      sigma *= 1.20;
      mu -= 3;
      notes.push('weather');
      keyFactors.push({
        factor: 'Adverse Weather',
        impact: 'negative',
        weight: 0.20,
        description: `Temp ${temp}°F, Wind ${wind}mph${rain ? ', Rain' : ''}`
      });
    }
  } else {
    dataCompleteness -= 0.05;
  }

  const highImpactInjuries = gameContext.injuries.filter(i => i.impact === 'high' && (i.status === 'out' || i.status === 'questionable')).length;
  if (highImpactInjuries > 0) {
    sigma *= (1 + highImpactInjuries * 0.10);
    mu -= highImpactInjuries * 2;
    notes.push('injuries');
    keyFactors.push({
      factor: 'Key Injuries',
      impact: 'negative',
      weight: 0.10 * highImpactInjuries,
      description: `${highImpactInjuries} high-impact player(s) out/questionable`
    });
  } else {
    dataCompleteness -= 0.05;
  }

  if (gameContext.earlySeason || homeTeamStats.gamesPlayed < 5 || awayTeamStats.gamesPlayed < 5) {
    sigma *= 1.15;
    const leagueAvg = leagueAverages.avgTotal;
    mu = 0.70 * mu + 0.30 * leagueAvg;
    notes.push('early-season-shrink');
    keyFactors.push({
      factor: 'Early Season Adjustment',
      impact: 'negative',
      weight: 0.15,
      description: `<5 games played - shrink toward league avg, inflate σ`
    });
  }

  const bothDefensiveTopQuartile = 
    (gameContext.defensiveRankHome && gameContext.defensiveRankHome <= 8) &&
    (gameContext.defensiveRankAway && gameContext.defensiveRankAway <= 8);

  if (bothDefensiveTopQuartile || gameContext.rivarly) {
    mu -= 3;
    sigma *= 1.10;
    notes.push('defensive-rivalry');
    keyFactors.push({
      factor: 'Defensive Matchup / Rivalry',
      impact: 'negative',
      weight: 0.10,
      description: 'Both teams strong defensively or rivalry game'
    });
  }

  const bounds = SIGMA_BOUNDS[sport];
  sigma = Math.max(bounds.min, Math.min(bounds.max, sigma));

  let w = 0;
  let mu_market: number | undefined;
  let marketData;

  if (homeTeamName && awayTeamName) {
    const oddsKey = SPORT_TO_ODDS_KEY[sport];
    const odds = await getOddsForGame(oddsKey, homeTeamName, awayTeamName);

    if (odds.source !== 'none' && odds.market_total_mean) {
      mu_market = odds.market_total_mean;
      const books = odds.num_books ?? 1;
      const dispersion = odds.market_total_std ?? 1.5;

      w = Math.min(MAX_MARKET_WEIGHT, 0.05 + (books / 30) * 0.05);

      marketData = {
        market_total_mean: odds.market_total_mean,
        market_total_std: odds.market_total_std,
        num_books: odds.num_books,
        source: odds.source,
      };

      keyFactors.push({
        factor: 'Market Data (small weight)',
        impact: 'neutral',
        weight: w,
        description: `Market: ${odds.market_total_mean.toFixed(1)} (${books} books, σ=${dispersion.toFixed(2)}, w=${(w*100).toFixed(0)}%)`
      });
    }
  }

  const mu_model = mu;
  let mu_post = mu;

  if (w > 0 && mu_market) {
    mu_post = (1 - w) * mu + w * mu_market;
  }

  const q = FLOOR_Q[sport] ?? 0.05;
  const z = getZScore(q);
  let mto_floor = mu_post - z * sigma;

  mto_floor = Math.max(0, mto_floor);

  if (sportsbookLine && sportsbookLine > 0) {
    const marketCap = MARKET_FLOOR_CAP * sportsbookLine;
    if (mto_floor > marketCap) {
      mto_floor = marketCap;
      notes.push('market-cap');
    }
  }

  if (mu_market && mu_market > 0) {
    const marketCap = MARKET_FLOOR_CAP * mu_market;
    if (mto_floor > marketCap) {
      mto_floor = marketCap;
      notes.push('market-cap');
    }
  }

  const stay_away_margin = sport === 'NCAA_FB' ? 5 : 4;
  let stay_away = false;
  if (sportsbookLine && sportsbookLine > 0) {
    stay_away = (sportsbookLine - mto_floor) <= stay_away_margin;
  } else if (mu_market && mu_market > 0) {
    stay_away = (mu_market - mto_floor) <= stay_away_margin;
  }

  let baseConfidence = Math.max(0.35, Math.min(0.95, dataCompleteness * 0.85 + (homeTeamStats.gamesPlayed > 10 && awayTeamStats.gamesPlayed > 10 ? 0.15 : 0)));

  if (marketData && marketData.market_total_std) {
    const dispersion = marketData.market_total_std;
    const confAdjustment = -Math.min(15, dispersion * 2);
    baseConfidence = Math.max(0.35, Math.min(0.95, baseConfidence + (confAdjustment / 100)));
  }

  if (DEV) {
    console.log('🔬 MTO Floor Diagnostics:', {
      game: `${homeTeamName} vs ${awayTeamName}`,
      mu_model: mu_model.toFixed(2),
      sigma_model: sigma.toFixed(2),
      mu_market: mu_market?.toFixed(2) ?? 'N/A',
      weight_w: w.toFixed(3),
      mu_post: mu_post.toFixed(2),
      sigma_post: sigma.toFixed(2),
      floor_q: q,
      z_score: z.toFixed(3),
      mto_floor: mto_floor.toFixed(2),
      expected_total: mu_post.toFixed(2),
      coverage_target: `${((1 - q) * 100).toFixed(0)}%`,
      sportsbook_line: sportsbookLine?.toFixed(2) ?? 'N/A',
      stay_away,
      notes: notes.join(', '),
      confidence: Math.round(baseConfidence * 100) + '%',
    });
  }

  return {
    gameId: `${input.homeTeamStats.teamId}-${input.awayTeamStats.teamId}`,
    sport,
    homeTeam: homeTeamStats.teamName,
    awayTeam: awayTeamStats.teamName,
    gameDate: new Date().toISOString(),
    predictedMTO: Math.round(mto_floor * 10) / 10,
    expected_total: Math.round(mu_post * 10) / 10,
    mto_floor: Math.round(mto_floor * 10) / 10,
    coverage_target: 1 - q,
    stay_away,
    confidence: Math.round(baseConfidence * 100) / 100,
    sportsbookLine,
    keyFactors,
    dataCompleteness: Math.round(dataCompleteness * 100) / 100,
    notes,
    marketData
  };
}

export function getLeagueAverages(sport: Sport) {
  const averages = {
    NFL: { avgTotal: 44.5, avgPace: 64, avgOffensiveEfficiency: 0.36, avgDefensiveEfficiency: 0.36 },
    NBA: { avgTotal: 223, avgPace: 99.5, avgOffensiveEfficiency: 113, avgDefensiveEfficiency: 113 },
    NHL: { avgTotal: 6.2, avgPace: 60, avgOffensiveEfficiency: 3.1, avgDefensiveEfficiency: 3.1 },
    MLB: { avgTotal: 8.8, avgPace: undefined, avgOffensiveEfficiency: 4.4, avgDefensiveEfficiency: 4.4 },
    NCAA_FB: { avgTotal: 56, avgPace: 72, avgOffensiveEfficiency: 0.38, avgDefensiveEfficiency: 0.38 },
    NCAA_BB: { avgTotal: 144, avgPace: 70, avgOffensiveEfficiency: 102, avgDefensiveEfficiency: 102 },
    SOCCER: { avgTotal: 2.8, avgPace: undefined, avgOffensiveEfficiency: 1.4, avgDefensiveEfficiency: 1.4 },
    TENNIS: { avgTotal: 3.5, avgPace: undefined, avgOffensiveEfficiency: undefined, avgDefensiveEfficiency: undefined }
  };

  return averages[sport];
}
