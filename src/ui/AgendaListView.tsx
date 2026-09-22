import { useState } from 'preact/hooks';
import { groupAgenda } from '../core/agenda';
import type { AgendaItem } from '../core/types';
import { AgendaRow } from './AgendaRow';
import { Icon } from './components';
import { useAppState, useStore } from './hooks';

const GROUP_LABEL = { overdue: 'Geciken', today: 'Bugün', upcoming: 'Yaklaşan', completed: 'Tamamlanan' } as const;

/** Takvim ekranının "Liste" modu: tüm ajanda kayıtları, tarihten bağımsız gruplanmış. */
export function AgendaListView({ onOpen }: { onOpen: (item: AgendaItem) => void }) {
  const store = useStore();
  const { agenda } = useAppState();
  const [completedOpen, setCompletedOpen] = useState(false);
  const now = new Date();
  const groups = groupAgenda(agenda, now);

  const section = (key: 'overdue' | 'today' | 'upcoming', items: AgendaItem[]) =>
    items.length > 0 && (
      <div class="field" key={key}>
        <span class="label">{GROUP_LABEL[key]}</span>
        <ul class="agenda-list">
          {items.map((item) => (
            <AgendaRow key={item.id} item={item} now={now} onOpen={() => onOpen(item)} onToggleDone={() => store.setAgendaDone(item.id, !item.done)} showDate />
          ))}
        </ul>
      </div>
    );

  const empty = agenda.length === 0;

  return (
    <div class="form">
      {empty && <p class="hint pad">Henüz hiç kayıt yok. Takvim görünümünden bir güne + Ekle ile başlayabilirsin.</p>}
      {section('overdue', groups.overdue)}
      {section('today', groups.today)}
      {section('upcoming', groups.upcoming)}
      {groups.completed.length > 0 && (
        <div class="field">
          <button class="collapsible-head" aria-expanded={completedOpen} onClick={() => setCompletedOpen((o) => !o)}>
            <span class="grow label" style={{ margin: 0 }}>
              Tamamlanan ({groups.completed.length})
            </span>
            <span class={`chev ${completedOpen ? 'open' : ''}`}>
              <Icon name="chevronDown" size={20} />
            </span>
          </button>
          {completedOpen && (
            <ul class="agenda-list">
              {groups.completed.map((item) => (
                <AgendaRow key={item.id} item={item} now={now} onOpen={() => onOpen(item)} onToggleDone={() => store.setAgendaDone(item.id, !item.done)} showDate />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
