import type { DateKey } from './dates';
import { planFor } from './plan';
import type { Habit } from './types';

/**
 * Alışkanlıklardan oluşan sıralı bir kontrol listesi ("Sabah rutinim": yatağı
 * topla +1, su iç +1 bardak, ...). Adım yalnızca `habitId`+`amount` taşır —
 * alışkanlığın adı/birimi HER ZAMAN o anki `Habit`'ten okunur, kopya
 * tutulmaz (tek doğruluk kaynağı).
 */
export interface RoutineStep {
  id: string;
  habitId: string;
  /** Bu adım tamamlanınca alışkanlığa eklenecek miktar (pozitif tam sayı). */
  amount: number;
}
export interface Routine {
  id: string;
  name: string;
  /** Sıra = dizi sırası. */
  steps: RoutineStep[];
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** Aynı alışkanlık aynı rutine ilk sürümde yalnızca bir kez eklenebilir. */
export function hasDuplicateHabit(steps: { habitId: string }[]): boolean {
  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.habitId)) return true;
    seen.add(s.habitId);
  }
  return false;
}

/** Bir rutinin, verilen günde PLANLI olan adımları (bugün planlanmamış/silinmiş alışkanlık adımları hariç). */
export function stepsPlannedToday(routine: Routine, habits: Habit[], date: DateKey): RoutineStep[] {
  return routine.steps.filter((s) => {
    const habit = habits.find((h) => h.id === s.habitId);
    return !!habit && planFor(habit, date) !== null;
  });
}

/**
 * Bir adımın işlenme kaydı — hem tamamlama hem atlama TEK sıralı günlükte
 * tutulur (`RoutineRunState.actions`), ki "geri al" son işlem tamamlama mı
 * atlama mı fark etmeksizin doğru olanı geri çevirebilsin. Yalnızca yerel
 * `routineRun`'da tutulur, senkronlanmaz.
 */
export interface RoutineStepAction {
  stepId: string;
  habitId: string;
  date: DateKey;
  kind: 'completed' | 'skipped';
  /** Gerçekte uygulanan miktar — `kind==='skipped'` ise her zaman 0; tamamlamada
   * hedefe kalan miktar adım miktarından azsa `amount`'tan küçük, zaten
   * tamamlanmışsa 0 olabilir. */
  appliedDelta: number;
}

/**
 * Aktif bir rutin çalıştırmasının durumu — Pomodoro'nun canlı sayaç durumu
 * (`PomoState`) ile AYNI ilke: yalnızca yerel `meta` olarak saklanır,
 * senkronlanmaz ("aktif rutin başka cihazda kendiliğinden açılmaz").
 * DEĞİŞMEZ: `actions.length === currentIndex` her zaman doğrudur.
 */
export interface RoutineRunState {
  runId: string;
  routineId: string;
  /** Başlatıldığı gün — gün değişince bu çalıştırma sessizce bugüne taşınmaz. */
  date: DateKey;
  /** O gün planlı olan adımların id'leri, sırayla (bkz. `stepsPlannedToday`). */
  stepOrder: string[];
  currentIndex: number;
  actions: RoutineStepAction[];
}

export function routineSummary(run: RoutineRunState): { total: number; completed: number } {
  return { total: run.stepOrder.length, completed: run.actions.filter((a) => a.kind === 'completed').length };
}
