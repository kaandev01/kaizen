import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { budgetRevisionFor, categoryPath, categoryStatsForRange, childrenOf } from '../core/categories';
import { toDateKey } from '../core/dates';
import { formatDuration } from '../core/format';
import { lastCompletedPeriod, weekRange } from '../core/periods';
import { Bar, Icon, Sheet, Stepper } from './components';
import { COLORS } from './palette';
import { useAppState, useStore } from './hooks';

const MAX_BUDGET_HOURS = 80;

/**
 * Sınırsız derinlikte iç içe kategoriler arasında gezinip birini seçmeyi (ya da
 * `allowNone` ile bağlantıyı kaldırmayı) sağlayan klasör tarayıcısı. Hem
 * `FocusScreen` (aktif seans kategorisi) hem `HabitEditor` (bağlı kategori)
 * tarafından kullanılır. `showBudget` yalnızca `FocusScreen`'den geçilir —
 * `HabitEditor`'ın bağlama modunda haftalık bütçe bölümü hiç anlamlı değil.
 */
export function CategoryPicker({
  selectedId,
  onSelect,
  onClose,
  allowNone,
  showBudget,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  allowNone?: boolean;
  showBudget?: boolean;
}) {
  const store = useStore();
  const { categories } = useAppState();
  const [parentId, setParentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const level = childrenOf(categories, parentId);
  const breadcrumb = parentId ? categoryPath(categories, parentId) : [];
  const here = parentId ? categories.find((c) => c.id === parentId) : undefined;

  const choose = (id: string | null) => {
    onSelect(id);
    onClose();
  };

  const addChild = () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = store.addCategory({ name, parentId, color: newColor });
      setNewName('');
      setAdding(false);
      setError(null);
      setParentId(created.id); // yeni oluşturulanın içine gir — alt kategori eklemeye hemen devam edilebilsin
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kategori eklenemedi.');
    }
  };

  return (
    <Sheet title="Kategori Seç" onClose={onClose} closeLabel="Vazgeç">
      <div class="form">
        <p class="hint category-breadcrumb">
          <button class="text-btn" onClick={() => setParentId(null)}>
            Kök
          </button>
          {breadcrumb.map((c) => (
            <span key={c.id}>
              {' '}
              ▸{' '}
              <button class="text-btn" onClick={() => setParentId(c.id)}>
                {c.name}
              </button>
            </span>
          ))}
        </p>

        {allowNone && !parentId && (
          <button class="setting link" onClick={() => choose(null)}>
            <span class="grow">Yok (bağlama)</span>
            {selectedId === null && <Icon name="check" size={18} />}
          </button>
        )}

        {here && showBudget && <CategoryBudgetSection categoryId={here.id} />}

        {here && (
          <button class="btn primary block" onClick={() => choose(here.id)}>
            “{here.name}” kategorisini seç
          </button>
        )}

        {level.length === 0 && <p class="hint">{here ? 'Bu kategorinin henüz alt kategorisi yok.' : 'Henüz kategori yok.'}</p>}

        <ul class="category-list">
          {level.map((c) => (
            <li key={c.id} class="row gap">
              <button class="setting link grow" style={{ '--c': c.color } as JSX.CSSProperties} onClick={() => setParentId(c.id)}>
                <span class="category-dot" aria-hidden="true" />
                <span class="grow">{c.name}</span>
                <Icon name="chevronRight" size={18} />
              </button>
              <button class="round-btn sm" aria-label={`"${c.name}" kategorisini seç`} onClick={() => choose(c.id)}>
                {selectedId === c.id ? <Icon name="check" size={16} /> : <Icon name="chevronRight" size={16} />}
              </button>
            </li>
          ))}
        </ul>

        {adding ? (
          <div class="panel">
            <label class="field">
              <span class="label">Yeni {here ? 'alt ' : ''}kategori adı</span>
              <input class="input" value={newName} maxLength={40} onInput={(e) => setNewName(e.currentTarget.value)} />
            </label>
            <div class="chips" role="radiogroup" aria-label="Renk">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-checked={newColor === c} class={`color-chip ${newColor === c ? 'on' : ''}`} style={{ '--c': c } as JSX.CSSProperties} onClick={() => setNewColor(c)} />
              ))}
            </div>
            {error && (
              <p class="error" role="alert">
                {error}
              </p>
            )}
            <div class="row gap">
              <button class="btn block" onClick={() => setAdding(false)}>
                Vazgeç
              </button>
              <button class="btn primary block" disabled={!newName.trim()} onClick={addChild}>
                Ekle
              </button>
            </div>
          </div>
        ) : (
          <button class="text-btn strong" onClick={() => setAdding(true)}>
            + Yeni {here ? 'alt ' : ''}kategori
          </button>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Bir kategorinin haftalık Pomodoro zaman bütçesi: hedef ekleme/düzenleme/
 * kaldırma, güncel haftanın ilerleme çubuğu + kalan süre, önceki haftanın
 * sonucu. Yalnızca `FocusScreen`'in kategori seçicisinde gösterilir.
 */
function CategoryBudgetSection({ categoryId }: { categoryId: string }) {
  const store = useStore();
  const { categoryBudgets, pomoSessions, categories } = useAppState();
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(1);

  const budget = categoryBudgets.find((b) => b.categoryId === categoryId);
  const today = toDateKey(new Date());
  const thisWeek = weekRange(today);
  const targetMs = budgetRevisionFor(budget, thisWeek.start)?.targetMs ?? null;
  const actualMs = categoryStatsForRange(pomoSessions, categories, thisWeek).get(categoryId) ?? 0;

  const prevWeek = lastCompletedPeriod('week', today);
  const prevTargetMs = budgetRevisionFor(budget, prevWeek.start)?.targetMs ?? null;
  const prevActualMs = categoryStatsForRange(pomoSessions, categories, prevWeek).get(categoryId) ?? 0;

  const startEdit = () => {
    setHours(targetMs ? Math.max(1, Math.round(targetMs / 3_600_000)) : 1);
    setEditing(true);
  };
  const save = () => {
    store.setCategoryBudget(categoryId, hours * 3_600_000);
    setEditing(false);
  };
  const remove = () => {
    store.setCategoryBudget(categoryId, null);
    setEditing(false);
  };

  const over = targetMs !== null && actualMs > targetMs;
  const remainingMs = targetMs !== null ? Math.max(0, targetMs - actualMs) : null;

  return (
    <div class="panel">
      <div class="row between">
        <span class="label">Haftalık hedef</span>
        {!editing && (
          <button class="text-btn" onClick={startEdit}>
            {targetMs !== null ? 'Düzenle' : 'Hedef ekle'}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <Stepper value={hours} min={1} max={MAX_BUDGET_HOURS} onChange={setHours} label="Haftalık hedef (saat)" suffix="saat" />
          <div class="row gap">
            {targetMs !== null && (
              <button class="btn block" onClick={remove}>
                Kaldır
              </button>
            )}
            <button class="btn primary block" onClick={save}>
              Kaydet
            </button>
          </div>
        </>
      ) : targetMs !== null ? (
        <>
          <Bar ratio={targetMs > 0 ? actualMs / targetMs : 0} class={over ? 'over' : ''} label="Haftalık ilerleme" valueText={`${formatDuration(actualMs)} / ${formatDuration(targetMs)}`} />
          <p class="hint">
            {formatDuration(actualMs)} / {formatDuration(targetMs)}
            {over && ' · hedef aşıldı'}
          </p>
          {remainingMs !== null && remainingMs > 0 && <p class="hint muted">Kalan: {formatDuration(remainingMs)}</p>}
          {prevTargetMs !== null && (
            <p class="hint muted">
              Önceki hafta: {formatDuration(prevActualMs)} / {formatDuration(prevTargetMs)}
            </p>
          )}
        </>
      ) : (
        <p class="hint">Bu kategori için haftalık hedef tanımlanmamış.</p>
      )}
    </div>
  );
}
