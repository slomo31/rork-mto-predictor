import type { OddsFeatures } from './OddsService';

export function boundedMarketBlend(muModel: number, sigmaModel: number, odds?: OddsFeatures) {
  if (!odds || odds.source === 'none' || !Number.isFinite(odds.market_total_mean!)) {
    return { mu: muModel, sigma: sigmaModel, confAdj: 0 };
  }

  const muMarket = odds.market_total_mean!;

  const books = Math.max(1, odds.num_books ?? 1);
  const dispersion = Math.max(0, odds.market_total_std ?? 0);
  let w = 0.10 + Math.min(0.20, (books / 20) * 0.20) - Math.min(0.10, dispersion / 20);
  w = Math.max(0.05, Math.min(0.30, w));

  let mu = (1 - w) * muModel + w * muMarket;
  const maxShift = 0.20 * muModel;
  mu = Math.max(muModel - maxShift, Math.min(muModel + maxShift, mu));

  let sigma = sigmaModel;
  if (dispersion > 1.0) sigma *= 1.10;
  if (dispersion > 1.5) sigma *= 1.15;

  const confAdj = -Math.min(15, dispersion * 2);
  return { mu, sigma, confAdj };
}
