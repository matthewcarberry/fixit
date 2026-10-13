export const nowIso = (date: Date = new Date()) => date.toISOString();

export const addHours = (iso: string, hours: number) =>
  new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
