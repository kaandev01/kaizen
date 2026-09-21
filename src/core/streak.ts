import { addDays, type DateKey } from './dates';
import { planFor } from './plan';
import type { Habit } from './types';

/**
 * Alışkanlığın güncel gün serisi.
 *  - Planlı gün tamamlandıysa seriye +1.
 *  - Bugün planlı ama henüz tamamlanmadıysa seri korunur (gün bitmeden bozulmaz).
 *  - Geçmişte planlı ve tamamlanmamış ilk gün seriyi bitirir.
 *  - Plansız günler seriyi ne artırır ne bozar.
 * Her şey kayıtlardan yeniden hesaplandığı için geri alma otomatik yansır.
 */
export function currentStreak(habit: Habit, amountOn: (date: DateKey) => number, today: DateKey): number {
  const start = habit.revisions[0].from;
  let streak = 0;
  for (let d = today; d >= start; d = addDays(d, -1)) {
    const plan = planFor(habit, d);
    if (!plan) continue;
    if (amountOn(d) >= plan.target) streak++;
    else if (d === today) continue;
    else break;
  }
  return streak;
}
