import { addDays, isoWeekday, type DateKey } from './dates';

/** Gelecekteki dönemsel analizler için tarih aralığı hesapları. Rapor üretmez, yalnızca sorgulamayı kolaylaştırır. */
export interface DateRange {
  /** Dahil. */
  start: DateKey;
  /** Dahil. */
  end: DateKey;
}

const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate(); // month 1-12

/** ISO hafta: Pazartesi başlangıçlı. */
export function weekRange(date: DateKey): DateRange {
  const start = addDays(date, -(isoWeekday(date) - 1));
  return { start, end: addDays(start, 6) };
}

export function monthRange(year: number, month: number): DateRange {
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` };
}

/** Aylık takvim ızgarası: Pazartesi başlangıçlı, tam 6 hafta (42 gün). */
export function monthGrid(year: number, month: number): DateKey[] {
  const first = `${year}-${pad(month)}-01`;
  const start = addDays(first, -(isoWeekday(first) - 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function quarterOf(month: number): 1 | 2 | 3 | 4 {
  return (Math.ceil(month / 3) as 1 | 2 | 3 | 4);
}

export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): DateRange {
  const startMonth = (quarter - 1) * 3 + 1;
  return { start: monthRange(year, startMonth).start, end: monthRange(year, startMonth + 2).end };
}

export function yearRange(year: number): DateRange {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export const inRange = (date: DateKey, range: DateRange): boolean => date >= range.start && date <= range.end;
export const rangesOverlap = (a: DateRange, b: DateRange): boolean => a.start <= b.end && b.start <= a.end;

export type PeriodKind = 'week' | 'month' | 'quarter' | 'year';

/**
 * `today` itibarıyla tamamen geçmiş (tamamlanmış) en son dönem — hangi
 * dönemin artık sorgulanabilir olduğunu bulmak için. Örn. haftalık rapor
 * takvimi "tamamlanan hafta için sonraki pazartesi" der; bu, herhangi bir
 * `today` için "içinde bulunduğumuz dönemden önceki dönem" ile aynı şeydir,
 * bu yüzden yalnızca dönem başı tarihlerde değil her gün hesaplanabilir.
 * Otomatik rapor üretmez/zamanlamaz; yalnızca aralığı döndürür.
 */
export function lastCompletedPeriod(kind: PeriodKind, today: DateKey): DateRange {
  const [y, m] = today.split('-').map(Number);
  switch (kind) {
    case 'week': {
      const current = weekRange(today);
      return { start: addDays(current.start, -7), end: addDays(current.start, -1) };
    }
    case 'month': {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return monthRange(py, pm);
    }
    case 'quarter': {
      const q = quarterOf(m);
      const [py, pq] = q === 1 ? [y - 1, 4 as const] : [y, (q - 1) as 1 | 2 | 3];
      return quarterRange(py, pq);
    }
    case 'year':
      return yearRange(y - 1);
  }
}
