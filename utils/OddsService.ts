export type OddsFeatures = {
  market_total_mean?: number;
  market_total_median?: number;
  market_total_std?: number;
  open_total?: number;
  current_total?: number;
  delta_total?: number;
  velocity_total_per_hr?: number;
  num_books?: number;
  alt_lines?: { line: number; over_price?: number; under_price?: number }[];
  last_updated?: string;
  source: 'oddsapi' | 'cache' | 'none';
};

type Outcome = { name: string; price: number; point?: number };
type Market = { key: string; last_update?: string; outcomes: Outcome[] };
type Bookmaker = { key: string; last_update?: string; markets: Market[] };
type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
};

function summarizeTotals(events: OddsEvent[]): OddsFeatures {
  const totals: number[] = [];
  const allAlt: { line: number; over_price?: number; under_price?: number }[] = [];
  let lastUpdated: string | undefined;
  const bookIds = new Set<string>();

  for (const e of events || []) {
    for (const b of e.bookmakers || []) {
      bookIds.add(b.key);
      for (const m of b.markets || []) {
        if (m.key === 'totals' || m.key === 'alternate_totals') {
          if (m.last_update) lastUpdated = m.last_update;
          const over = m.outcomes?.find(o => o.name?.toLowerCase().startsWith('over'));
          const under = m.outcomes?.find(o => o.name?.toLowerCase().startsWith('under'));
          const line = over?.point ?? under?.point;
          if (typeof line === 'number') {
            totals.push(line);
            allAlt.push({ line, over_price: over?.price, under_price: under?.price });
          }
        }
      }
    }
  }

  if (totals.length === 0) return { source: 'none' };
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const sorted = [...totals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const std =
    totals.length > 1
      ? Math.sqrt(totals.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / (totals.length - 1))
      : 0;

  return {
    market_total_mean: mean,
    market_total_median: median,
    market_total_std: std,
    num_books: bookIds.size,
    last_updated: lastUpdated,
    alt_lines: dedupeAlt(allAlt),
    source: 'oddsapi',
  };
}

function dedupeAlt(items: { line: number; over_price?: number; under_price?: number }[]) {
  const map = new Map<number, { line: number; over_price?: number; under_price?: number }>();
  for (const x of items) {
    const key = Number(x.line.toFixed(2));
    if (!map.has(key)) map.set(key, x);
  }
  return [...map.values()].sort((a, b) => a.line - b.line).slice(0, 30);
}

export async function getOddsFeatures(sportKey: string): Promise<OddsFeatures> {
  try {
    const res = await fetch(`/api/odds?sport=${encodeURIComponent(sportKey)}&regions=us&markets=totals,alternate_totals`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { source: 'none' };
    const payload = await res.json();
    const data: OddsEvent[] = Array.isArray(payload?.data) ? payload.data : [];
    return summarizeTotals(data);
  } catch {
    return { source: 'none' };
  }
}

function normName(s: string) { 
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); 
}

function teamsMatch(aHome: string, aAway: string, bHome: string, bAway: string) {
  const ah = normName(aHome), aa = normName(aAway), bh = normName(bHome), ba = normName(bAway);
  return (ah === bh && aa === ba) || (ah === ba && aa === bh);
}

export async function getOddsForGame(sportKey: string, home: string, away: string) {
  try {
    const res = await fetch(`/api/odds?sport=${encodeURIComponent(sportKey)}&regions=us&markets=totals,alternate_totals`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { source: 'none' as const };
    const payload = await res.json();
    const events: OddsEvent[] = Array.isArray(payload?.data) ? payload.data : [];
    const found = events.find(e => teamsMatch(home, away, e.home_team, e.away_team));
    if (!found) return { source: 'none' as const };

    const summary = summarizeTotals([found]);
    const sourceFromPayload = (payload?.source ?? 'oddsapi') as 'oddsapi'|'cache';
    return { ...summary, source: sourceFromPayload };
  } catch {
    return { source: 'none' as const };
  }
}
