import { describe, expect, it } from 'vitest';
import { inRange, lastCompletedPeriod, monthGrid, monthRange, quarterRange, rangesOverlap, weekRange, yearRange } from '../src/core/periods';

describe('dönem aralıkları', () => {
  it('haftalık aralık Pazartesi başlar, Pazar biter', () => {
    // 2026-09-21 Pazartesi.
    expect(weekRange('2026-09-23')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    expect(weekRange('2026-09-21')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    expect(weekRange('2026-09-27')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
  });

  it('aylık aralık ayın son gününü doğru bulur (artık yıl dahil)', () => {
    expect(monthRange(2026, 9)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(monthRange(2028, 2)).toEqual({ start: '2028-02-01', end: '2028-02-29' }); // artık yıl
    expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('üç aylık aralık üç ayı kapsar', () => {
    expect(quarterRange(2026, 1)).toEqual({ start: '2026-01-01', end: '2026-03-31' });
    expect(quarterRange(2026, 4)).toEqual({ start: '2026-10-01', end: '2026-12-31' });
  });

  it('yıllık aralık', () => {
    expect(yearRange(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('inRange / rangesOverlap', () => {
    const r = monthRange(2026, 9);
    expect(inRange('2026-09-15', r)).toBe(true);
    expect(inRange('2026-08-31', r)).toBe(false);
    expect(inRange('2026-10-01', r)).toBe(false);
    expect(rangesOverlap(r, weekRange('2026-09-28'))).toBe(true); // 28 Eylül haftası (22 Eyl-4 Eki) Eylül'e taşar
    expect(rangesOverlap(r, monthRange(2026, 11))).toBe(false);
  });
});

describe('lastCompletedPeriod — rapor takvimi', () => {
  it('haftalık: bugün Pazartesi olsa da önceki hafta tamamlanmış sayılır', () => {
    expect(lastCompletedPeriod('week', '2026-09-21')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
    // Haftanın ortasında sorgulansa da aynı "önceki hafta" bulunur.
    expect(lastCompletedPeriod('week', '2026-09-24')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
  });

  it('aylık: ayın başında (rapor takvimi) önceki ay tamamlanmış sayılır', () => {
    expect(lastCompletedPeriod('month', '2026-10-01')).toEqual(monthRange(2026, 9));
    expect(lastCompletedPeriod('month', '2027-01-01')).toEqual(monthRange(2026, 12)); // yıl sınırı
  });

  it('üç aylık: 1 Ocak/Nisan/Temmuz/Ekim tam olarak önceki çeyreği tamamlanmış sayar', () => {
    expect(lastCompletedPeriod('quarter', '2026-01-01')).toEqual(quarterRange(2025, 4)); // yıl sınırı
    expect(lastCompletedPeriod('quarter', '2026-04-01')).toEqual(quarterRange(2026, 1));
    expect(lastCompletedPeriod('quarter', '2026-07-01')).toEqual(quarterRange(2026, 2));
    expect(lastCompletedPeriod('quarter', '2026-10-01')).toEqual(quarterRange(2026, 3));
  });

  it('yıllık: 31 Aralık sonrası (1 Ocak) önceki yıl tamamlanmış sayılır', () => {
    expect(lastCompletedPeriod('year', '2027-01-01')).toEqual(yearRange(2026));
  });
});

describe('monthGrid', () => {
  it('Pazartesi başlangıçlı 42 günlük ızgara, ayın tüm günlerini kapsar', () => {
    const cells = monthGrid(2026, 9); // Eylül 2026: 1'i Salı
    expect(cells).toHaveLength(42);
    expect(cells[0]).toBe('2026-08-31'); // önceki ayın Pazartesi'si
    expect(cells).toContain('2026-09-01');
    expect(cells).toContain('2026-09-30');
  });
});
