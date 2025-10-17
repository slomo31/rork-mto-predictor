export function toISODateLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
