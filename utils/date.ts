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
  return { start, end };
}

export function isISOWithinLocalDate(isoDateTime: string, isoDate: string) {
  const { start, end } = localDayRange(isoDate);
  const t = new Date(isoDateTime).getTime();
  return t >= start && t <= end;
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
