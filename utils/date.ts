export function toISODateLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const result = `${y}-${m}-${day}`;
  console.log(`[toISODateLocal] Generated date: ${result}`);
  return result;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m! - 1), d!);
  dt.setDate(dt.getDate() + days);
  return toISODateLocal(dt);
}

export function localDayRange(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = new Date(y!, (m! - 1), d!, 0, 0, 0, 0).getTime();
  const end = new Date(y!, (m! - 1), d!, 23, 59, 59, 999).getTime();
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[localDayRange] For date ${isoDate}:`);
    console.log(`  Start: ${new Date(start).toISOString()} (${start})`);
    console.log(`  End: ${new Date(end).toISOString()} (${end})`);
  }
  
  return { start, end };
}

export function isISOWithinLocalDate(isoDateTime: string, isoDate: string) {
  const gameDate = new Date(isoDateTime);
  const gameUTCDateStr = gameDate.toISOString().slice(0, 10);
  const gameLocalDateStr = `${gameDate.getFullYear()}-${String(gameDate.getMonth() + 1).padStart(2, '0')}-${String(gameDate.getDate()).padStart(2, '0')}`;
  
  const [y, m, d] = isoDate.split('-').map(Number);
  const targetDate = new Date(y!, (m! - 1), d!);
  const targetUTCStr = targetDate.toISOString().slice(0, 10);
  
  const prevDay = new Date(targetDate);
  prevDay.setDate(prevDay.getDate() - 1);
  const prevDayStr = prevDay.toISOString().slice(0, 10);
  
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);
  
  const matchesExact = gameLocalDateStr === isoDate;
  const matchesUTC = gameUTCDateStr === targetUTCStr;
  const matchesPrevDay = gameUTCDateStr === prevDayStr;
  const matchesNextDay = gameUTCDateStr === nextDayStr;
  
  const matches = matchesExact || matchesUTC || matchesPrevDay || matchesNextDay;
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Date Filter] Game UTC: ${gameUTCDateStr}, Local: ${gameLocalDateStr}, Target: ${isoDate}, Match: ${matches}`);
  }
  
  return matches;
}

export function toYyyymmddUTC(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m! - 1), d!));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function getNext7Dates(fromISO = toISODateLocal()): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(addDaysISO(fromISO, i));
  }
  return out;
}

export function clampToNext7Days(iso: string, base = toISODateLocal()): string {
  const window = getNext7Dates(base);
  const min = window[0]!;
  const max = window[6]!;
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}
