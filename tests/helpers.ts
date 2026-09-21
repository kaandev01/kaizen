import type { Clock } from '../src/core/dates';
import type { HabitInput } from '../src/core/validation';
import { MemoryStorage, type Storage } from '../src/storage/storage';
import { Store } from '../src/storage/store';

/** Elle ilerletilebilen saat. Ay 1-12, yerel saat. */
export class FakeClock implements Clock {
  private t: number;
  constructor(y: number, mo: number, d: number, h = 9, mi = 0) {
    this.t = new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  }
  now() {
    return new Date(this.t);
  }
  set(y: number, mo: number, d: number, h = 9, mi = 0) {
    this.t = new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  }
  advanceMs(ms: number) {
    this.t += ms;
  }
}

export const habitInput = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: 'Su iç',
  icon: '💧',
  color: '#3b82f6',
  target: 2,
  unit: 'bardak',
  schedule: { kind: 'daily' },
  reminders: [],
  ...over,
});

export async function makeStore(clock: FakeClock, storage: Storage = new MemoryStorage()) {
  let n = 0;
  const store = new Store(storage, clock, () => `id${++n}`);
  await store.init();
  return { store, storage, clock };
}
