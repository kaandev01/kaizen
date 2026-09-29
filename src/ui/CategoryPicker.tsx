import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { categoryPath, childrenOf } from '../core/categories';
import { Icon, Sheet } from './components';
import { COLORS } from './palette';
import { useAppState, useStore } from './hooks';

/**
 * Sınırsız derinlikte iç içe kategoriler arasında gezinip birini seçmeyi (ya da
 * `allowNone` ile bağlantıyı kaldırmayı) sağlayan klasör tarayıcısı. Hem
 * `FocusScreen` (aktif seans kategorisi) hem `HabitEditor` (bağlı kategori)
 * tarafından kullanılır.
 */
export function CategoryPicker({
  selectedId,
  onSelect,
  onClose,
  allowNone,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  allowNone?: boolean;
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
