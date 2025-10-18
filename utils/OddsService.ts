import { buildApiUrl } from '@/utils/apiUrl';

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
    const url = buildApiUrl(
      `/api/odds-api?sportKey=${encodeURIComponent(
        sportKey
      )}&regions=us&markets=totals,alternate_totals`
    );
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { source: 'none' };
    const payload = await res.json();
    const data: OddsEvent[] = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
      ? payload
      : [];
    return summarizeTotals(data);
  } catch {
    return { source: 'none' };
  }
}

const ALIASES: Record<string, string> = {
  'la clippers': 'los angeles clippers',
  'la lakers': 'los angeles lakers',
  'ny knicks': 'new york knicks',
  'ny rangers': 'new york rangers',
  'ny islanders': 'new york islanders',
  'ny jets': 'new york jets',
  'ny giants': 'new york giants',
  ucf: 'central florida',
  'miami fl': 'miami',
  'miami (fl)': 'miami',
  usc: 'southern california',
  lsu: 'louisiana state',
  'ole miss': 'mississippi',
  tcu: 'texas christian',
  smu: 'southern methodist',
  byu: 'brigham young',
  'la rams': 'los angeles rams',
  'la chargers': 'los angeles chargers',
  'washington commanders': 'washington',
  'arizona state': 'arizona st',
  'boston college': 'boston coll',
  'florida state': 'florida st',
  'georgia tech': 'georgia tech',
  'iowa state': 'iowa st',
  'kansas state': 'kansas st',
  'michigan state': 'michigan st',
  'mississippi state': 'mississippi st',
  'nc state': 'north carolina st',
  'ohio state': 'ohio st',
  oklahoma: 'oklahoma',
  'oklahoma state': 'oklahoma st',
  'oregon state': 'oregon st',
  'penn state': 'penn st',
  'san diego state': 'san diego st',
  'washington state': 'washington st',
};

export function normalizeTeam(s: string): string {
  const t = (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return ALIASES[t] ?? t;
}

function teamsMatch(aHome: string, aAway: string, bHome: string, bAway: string) {
  const ah = normalizeTeam(aHome),
    aa = normalizeTeam(aAway),
    bh = normalizeTeam(bHome),
    ba = normalizeTeam(bAway);
  return (ah === bh && aa === ba) || (ah === ba && aa === bh);
}

export async function getOddsForGame(
  sportKey: string,
  home: string,
  away: string
): Promise<OddsFeatures> {
  try {
    const url = buildApiUrl(
      `/api/odds-api?sportKey=${encodeURIComponent(
        sportKey
      )}&regions=us&markets=totals,alternate_totals`
    );
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { source: 'none' as const };
    const payload = await res.json();
    const events: OddsEvent[] = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
      ? payload
      : [];
    const found = events.find(e => teamsMatch(home, away, e.home_team, e.away_team));
    if (!found) return { source: 'none' as const };

    const summary = summarizeTotals([found]);
    const sourceFromPayload = (payload?.source ?? 'oddsapi') as 'oddsapi' | 'cache';
    return { ...summary, source: sourceFromPayload };
  } catch {
    return { source: 'none' as const };
  }
}

export type OddsFixture = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: {
    key: string;
    markets?: {
      key: string;
      outcomes?: { name: string; price: number; point?: number }[];
    }[];
  }[];
};

export async function getFixturesForDate(
  sportKey: string,
  _isoDate: string // reserved for future server-side filtering
): Promise<OddsFixture[]> {
  try {
    const baseUrl = buildApiUrl('/api/odds-api');
    const params = new URLSearchParams({
      sportKey: sportKey,
      regions: 'us',
      markets: 'totals',
      oddsFormat: 'american',
      dateFormat: 'iso',
    });
    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Odds fixtures failed: ${res.status}`);
    const json = await res.json();
    const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return data as OddsFixture[];
  } catch (e) {
    console.warn('[getFixturesForDate] Failed:', e);
    return [];
  }
}

export function extractConsensusTotal(fix: OddsFixture): number | undefined {
  const totals: number[] = [];
  for (const bk of fix.bookmakers || []) {
    for (const m of bk.markets || []) {
      if (m.key !== 'totals') continue;
      for (const o of m.outcomes || []) {
        if (typeof o.point === 'number') totals.push(o.point);
      }
    }
  }
  if (!totals.length) return undefined;
  totals.sort((a, b) => a - b);
  const mid = Math.floor(totals.length / 2);
  return totals.length % 2 ? totals[mid] : (totals[mid - 1]! + totals[mid]!) / 2;
}