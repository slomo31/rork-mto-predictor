import { CalculationInput, KeyFactor, MTOPrediction, Sport } from '@/types/sports';
import { getOddsForGame } from './OddsService';
import { boundedMarketBlend } from './marketBlend';

const SPORTSBOOK_MAX_WEIGHT = 0.30;

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

export async function calculateMTO(input: CalculationInput, homeTeamName?: string, awayTeamName?: string): Promise<MTOPrediction> {
  const {
    homeTeamStats,
    awayTeamStats,
    gameContext,
    sport,
    sportsbookLine,
    leagueAverages
  } = input;

  const keyFactors: KeyFactor[] = [];
  let dataCompleteness = 1.0;

  const homeAvgScored = homeTeamStats.avgPointsScored || leagueAverages.avgTotal / 2;
  const awayAvgScored = awayTeamStats.avgPointsScored || leagueAverages.avgTotal / 2;
  const homeAvgAllowed = homeTeamStats.avgPointsAllowed || leagueAverages.avgTotal / 2;
  const awayAvgAllowed = awayTeamStats.avgPointsAllowed || leagueAverages.avgTotal / 2;

  if (!homeTeamStats.avgPointsScored || !awayTeamStats.avgPointsScored) {
    dataCompleteness -= 0.2;
  }

  const homeRecentAvg = homeTeamStats.recentForm.length > 0 ? 
    homeTeamStats.recentForm.slice(-5).reduce((sum, val) => sum + val, 0) / Math.min(5, homeTeamStats.recentForm.length) : 
    homeAvgScored;
  
  const awayRecentAvg = awayTeamStats.recentForm.length > 0 ? 
    awayTeamStats.recentForm.slice(-5).reduce((sum, val) => sum + val, 0) / Math.min(5, awayTeamStats.recentForm.length) : 
    awayAvgScored;

  const homeExpectedOffense = homeRecentAvg * 0.6 + homeAvgScored * 0.4;
  const awayExpectedOffense = awayRecentAvg * 0.6 + awayAvgScored * 0.4;
  
  const homeExpectedDefense = homeAvgAllowed;
  const awayExpectedDefense = awayAvgAllowed;
  
  const homeExpected = (homeExpectedOffense * 0.6 + awayExpectedDefense * 0.4);
  const awayExpected = (awayExpectedOffense * 0.6 + homeExpectedDefense * 0.4);
  
  let baseTotal = homeExpected + awayExpected;

  keyFactors.push({
    factor: 'Team Scoring Trends',
    impact: baseTotal > leagueAverages.avgTotal ? 'positive' : 'negative',
    weight: 0.3,
    description: `Avg combined: ${baseTotal.toFixed(1)} vs league ${leagueAverages.avgTotal.toFixed(1)}`
  });

  if (homeTeamStats.pace && awayTeamStats.pace && leagueAverages.avgPace) {
    const avgPace = (homeTeamStats.pace + awayTeamStats.pace) / 2;
    const paceAdjustment = (avgPace - leagueAverages.avgPace) / leagueAverages.avgPace;
    baseTotal *= (1 + paceAdjustment * 0.08);

    keyFactors.push({
      factor: 'Pace/Tempo',
      impact: paceAdjustment > 0 ? 'positive' : 'negative',
      weight: 0.08,
      description: `Avg pace: ${avgPace.toFixed(1)} (league: ${leagueAverages.avgPace.toFixed(1)})`
    });
  } else {
    dataCompleteness -= 0.1;
  }

  if (homeTeamStats.offensiveEfficiency && awayTeamStats.offensiveEfficiency && 
      homeTeamStats.defensiveEfficiency && awayTeamStats.defensiveEfficiency &&
      leagueAverages.avgOffensiveEfficiency && leagueAverages.avgDefensiveEfficiency) {
    
    const avgOffEff = (homeTeamStats.offensiveEfficiency + awayTeamStats.offensiveEfficiency) / 2;
    const avgDefEff = (homeTeamStats.defensiveEfficiency + awayTeamStats.defensiveEfficiency) / 2;
    
    const effAdjustment = (
      (avgOffEff - leagueAverages.avgOffensiveEfficiency) / leagueAverages.avgOffensiveEfficiency -
      (avgDefEff - leagueAverages.avgDefensiveEfficiency) / leagueAverages.avgDefensiveEfficiency
    ) * 0.06;
    
    baseTotal *= (1 + effAdjustment);

    keyFactors.push({
      factor: 'Offensive/Defensive Efficiency',
      impact: effAdjustment > 0 ? 'positive' : 'negative',
      weight: 0.06,
      description: `Combined efficiency differential`
    });
  } else {
    dataCompleteness -= 0.1;
  }

  if (gameContext.injuries.length > 0) {
    const highImpactInjuries = gameContext.injuries.filter(i => i.impact === 'high' && i.status === 'out').length;
    const injuryPenalty = highImpactInjuries * 0.05;
    baseTotal *= (1 - injuryPenalty);

    keyFactors.push({
      factor: 'Injuries',
      impact: 'negative',
      weight: 0.05,
      description: `${highImpactInjuries} high-impact player(s) out`
    });
  } else {
    dataCompleteness -= 0.05;
  }

  if (gameContext.weather && !gameContext.weather.indoor) {
    if (gameContext.weather.precipitation || (gameContext.weather.windSpeed && gameContext.weather.windSpeed > 15)) {
      baseTotal *= 0.88;
      keyFactors.push({
        factor: 'Weather',
        impact: 'negative',
        weight: 0.12,
        description: `Adverse conditions: ${gameContext.weather.conditions}`
      });
    }
  } else if (['NFL', 'MLB', 'SOCCER', 'NCAA_FB'].includes(sport)) {
    dataCompleteness -= 0.05;
  }

  if (gameContext.restDays < 2) {
    baseTotal *= 0.95;
    keyFactors.push({
      factor: 'Rest Days',
      impact: 'negative',
      weight: 0.05,
      description: `Only ${gameContext.restDays} day(s) rest`
    });
  }

  if (gameContext.venue === 'home') {
    baseTotal *= 1.01;
  }

  const homeFormStdDev = calculateStdDev(homeTeamStats.recentForm);
  const awayFormStdDev = calculateStdDev(awayTeamStats.recentForm);
  const totalStdDev = Math.sqrt(homeFormStdDev * homeFormStdDev + awayFormStdDev * awayFormStdDev);
  
  const effectiveStdDev = totalStdDev > 0 ? totalStdDev : baseTotal * 0.12;
  
  const zScore = -1.28;
  let conservativeFloor = baseTotal + (zScore * effectiveStdDev);
  
  conservativeFloor = Math.max(conservativeFloor, baseTotal * 0.75);
  conservativeFloor = Math.min(conservativeFloor, baseTotal * 0.88);
  
  let mto = conservativeFloor;

  if (sportsbookLine && !isNaN(sportsbookLine)) {
    const lineWeight = Math.min(SPORTSBOOK_MAX_WEIGHT, 0.15 + (1 - dataCompleteness) * 0.10);
    const modelWeight = 1 - lineWeight;
    const blendedTotal = (conservativeFloor * modelWeight) + (sportsbookLine * lineWeight);
    
    mto = Math.min(blendedTotal, sportsbookLine * 0.92);

    keyFactors.push({
      factor: 'Sportsbook Line',
      impact: 'neutral',
      weight: lineWeight,
      description: `Line: ${sportsbookLine.toFixed(1)} (${(lineWeight * 100).toFixed(0)}% weight)`
    });
  }

  let marketData;
  let finalMTO = mto;
  let baseConfidence = Math.max(0.3, Math.min(0.95, dataCompleteness * 0.85 + (homeTeamStats.gamesPlayed > 10 && awayTeamStats.gamesPlayed > 10 ? 0.15 : 0)));

  if (homeTeamName && awayTeamName) {
    const oddsKey = SPORT_TO_ODDS_KEY[sport];
    const odds = await getOddsForGame(oddsKey, homeTeamName, awayTeamName);
    
    if (odds.source !== 'none' && odds.market_total_mean) {
      const muModel = baseTotal;
      const sigmaModel = effectiveStdDev;
      const { mu, sigma, confAdj, weight } = boundedMarketBlend(muModel, sigmaModel, odds, sport);
      
      const z15 = 1.036;
      const mtoFloor = mu - z15 * sigma;
      
      finalMTO = Math.max(0, mtoFloor);
      
      const defaultStd: Record<Sport, number> = {
        NFL: 1.5, NCAA_FB: 2.0, NBA: 2.5, NCAA_BB: 3.0,
        MLB: 0.5, NHL: 0.7, SOCCER: 0.8, TENNIS: 0.6
      };
      const dispersion = Math.max(0, odds.market_total_std ?? defaultStd[sport] ?? 1.5);
      const confAdjustment = -Math.min(15, dispersion * 2);
      baseConfidence = Math.max(0.35, Math.min(0.95, baseConfidence + (confAdjustment / 100)));
      
      marketData = {
        market_total_mean: odds.market_total_mean,
        market_total_std: odds.market_total_std,
        num_books: odds.num_books,
        source: odds.source,
      };
      
      keyFactors.push({
        factor: 'Market Data Integration',
        impact: 'neutral',
        weight: weight,
        description: `Market: ${odds.market_total_mean.toFixed(1)} (${odds.num_books ?? 0} books, σ=${(odds.market_total_std ?? defaultStd[sport] ?? 0).toFixed(2)})`
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('🔬 MTO Diagnostics:', {
          game: `${homeTeamName} vs ${awayTeamName}`,
          mu_model: muModel.toFixed(2),
          sigma_model: sigmaModel.toFixed(2),
          mu_market: odds.market_total_mean.toFixed(2),
          std_market: (odds.market_total_std ?? defaultStd[sport] ?? 0).toFixed(2),
          num_books: odds.num_books ?? 0,
          weight_w: weight.toFixed(3),
          mu_post: mu.toFixed(2),
          sigma_post: sigma.toFixed(2),
          mto_floor: finalMTO.toFixed(2),
          sportsbook_line: sportsbookLine?.toFixed(2) ?? 'N/A',
          confidence: Math.round(baseConfidence * 100) + '%',
        });
      }
    }
  }

  return {
    gameId: `${input.homeTeamStats.teamId}-${input.awayTeamStats.teamId}`,
    sport,
    homeTeam: homeTeamStats.teamName,
    awayTeam: awayTeamStats.teamName,
    gameDate: new Date().toISOString(),
    predictedMTO: Math.round(finalMTO * 10) / 10,
    confidence: Math.round(baseConfidence * 100) / 100,
    sportsbookLine,
    keyFactors,
    dataCompleteness: Math.round(dataCompleteness * 100) / 100,
    marketData
  };
}

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
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
