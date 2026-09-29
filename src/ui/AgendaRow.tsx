import { formatUrgencyPhrase, isOverdue, urgencyOf } from '../core/agenda';
import { formatShortDate } from '../core/dates';
import type { AgendaItem } from '../core/types';
import { Icon } from './components';

const IMPORTANCE_LABEL = { normal: null, important: 'Önemli', critical: 'Kritik' } as const;

/**
 * Tüm ajanda listelerinde (Bugün → Yaklaşan, Takvim → seçili gün, Ajanda →
 * Liste) kullanılan tek satır. Yalnızca renkle durum anlatmaz: her zaman kısa
 * bir metin/ikon eşlik eder.
 */
export function AgendaRow({ item, now, onOpen, onToggleDone, showDate = false }: { item: AgendaItem; now: Date; onOpen: () => void; onToggleDone: () => void; showDate?: boolean }) {
  const urgency = urgencyOf(item, now);
  const overdue = isOverdue(item, now);
  const importanceLabel = IMPORTANCE_LABEL[item.importance];
  return (
    <li class={`agenda-row ${item.done ? 'done' : ''} ${overdue ? 'overdue' : ''} urgency-${urgency}`}>
      <button
        class="agenda-check"
        aria-label={item.done ? `${item.title}: tamamlanmadı olarak işaretle` : `${item.title}: tamamlandı olarak işaretle`}
        onClick={onToggleDone}
      >
        {item.done && <Icon name="check" size={16} />}
      </button>
      <button class="agenda-main" onClick={onOpen}>
        <span class="agenda-main-text">
          <span class="agenda-title">{item.title}</span>
          <span class="agenda-meta">
            {showDate ? `${formatShortDate(item.date)} · ` : ''}
            {item.done ? 'Tamamlandı' : formatUrgencyPhrase(item, now)}
            {!item.time && !showDate ? ' · Tüm gün' : ''}
          </span>
        </span>
        {importanceLabel && !item.done && <span class={`importance-badge ${item.importance}`}>{importanceLabel}</span>}
      </button>
    </li>
  );
}
