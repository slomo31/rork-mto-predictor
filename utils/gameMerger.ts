import { normalizeTeam } from './OddsService';

type RawGame = {
  id: string;
  home: string;
  away: string;
  homeId?: string;
  awayId?: string;
  homeLogo?: string;
  awayLogo?: string;
  commenceTimeUTC: string;
  venue?: string;
  status?: string;
  total?: number;
  numBooks?: number;
  stdBooks?: number;
  source: 'oddsapi' | 'espn' | 'merged';
};

export function mergeGames(oddsGames: RawGame[], espnGames: RawGame[]): RawGame[] {
  const thirtyMin = 30 * 60 * 1000;

  function keyFor(g: RawGame) {
    const h = normalizeTeam(g.home);
    const a = normalizeTeam(g.away);
    const t = new Date(g.commenceTimeUTC).getTime();
    return `${a}__${h}__${Math.floor(t / thirtyMin)}`;
  }

  const map = new Map<string, RawGame>();

  [...(espnGames || []), ...(oddsGames || [])].forEach(g => {
    const k = keyFor(g);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, g);
    } else {
      const keep = cur.total != null ? cur : g;
      const other = cur.total != null ? g : cur;
      map.set(k, {
        ...keep,
        homeLogo: keep.homeLogo || other.homeLogo,
        awayLogo: keep.awayLogo || other.awayLogo,
        homeId: keep.homeId || other.homeId,
        awayId: keep.awayId || other.awayId,
        venue: keep.venue || other.venue,
        source: keep.total != null ? keep.source : (other.source === 'oddsapi' ? 'oddsapi' : keep.source),
      });
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    new Date(a.commenceTimeUTC).getTime() - new Date(b.commenceTimeUTC).getTime()
  );
}
