import { addDays, toDateKey, type DateKey } from './dates';
import { currentRevision, scheduleIncludes } from './plan';
import type { Habit } from './types';

/**
 * iPhone Takvim'ine aktarılabilen tekrarlayan olaylar (VALARM = uyarı).
 * PWA'nın zamanlanmış yerel bildirim veremediği iOS'ta, uygulama kapalıyken
 * çalışan tek sunucusuz hatırlatma yolu budur. UID sabit olduğundan aynı
 * dosya yeniden içe aktarılınca olaylar güncellenir; kaldırılan saatler
 * Takvim'den elle silinmelidir.
 */
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line: string): string {
  // Kod noktası bazlı katlama (emoji vekil çiftlerini bölmemek için); UTF-8 için ~60 karakter güvenli.
  const chars = Array.from(line);
  if (chars.length <= 60) return line;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += 60) parts.push(chars.slice(i, i + 60).join(''));
  return parts.join('\r\n ');
}

const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T` +
  `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;

function firstPlannedDay(habit: Habit, from: DateKey): DateKey {
  const sched = currentRevision(habit).schedule;
  for (let i = 0; i < 8; i++) {
    const d = addDays(from, i);
    if (scheduleIncludes(sched, d)) return d;
  }
  return from;
}

export function buildIcs(habits: Habit[], now: Date): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kaizen//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Kaizen'];
  const today = toDateKey(now);
  for (const habit of habits) {
    const rev = currentRevision(habit);
    for (const time of habit.reminders) {
      const startDay = firstPlannedDay(habit, today);
      const [y, m, d] = startDay.split('-');
      const [hh, mm] = time.split(':');
      const rule =
        rev.schedule.kind === 'daily'
          ? 'FREQ=DAILY'
          : `FREQ=WEEKLY;BYDAY=${rev.schedule.days.map((n) => BYDAY[n - 1]).join(',')}`;
      const title = `${habit.name} — ${rev.target} ${rev.unit}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${habit.id}-${hh}${mm}@kaizen`,
        `DTSTAMP:${stamp(now)}`,
        `SEQUENCE:${Math.floor(now.getTime() / 1000)}`,
        `DTSTART:${y}${m}${d}T${hh}${mm}00`,
        'DURATION:PT10M',
        `RRULE:${rule}`,
        `SUMMARY:${esc(title)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(habit.name)}`,
        'TRIGGER:PT0S',
        'END:VALARM',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

