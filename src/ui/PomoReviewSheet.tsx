import { useState } from 'preact/hooks';
import { Sheet } from './components';
import { useAppState, useStore } from './hooks';

/**
 * Bir odak seansı TAMAMLANDIĞINDA (App.tsx tetikler) açılan, isteğe bağlı
 * öz-değerlendirme formu: 0-10 arası bir puan + kısa bir not. Tamamen
 * atlanabilir — "Kaydet"e basılmadan kapatılırsa hiçbir şey yazılmaz.
 */
export function PomoReviewSheet({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const store = useStore();
  const { pomoSessions } = useAppState();
  const session = pomoSessions.find((s) => s.id === sessionId);
  const [rating, setRating] = useState<number | null>(session?.rating ?? null);
  const [note, setNote] = useState(session?.note ?? '');

  // Kayıt bir şekilde bulunamazsa (silinmiş vb.) sessizce hiç açma.
  if (!session) return null;

  const save = () => {
    store.setPomoSessionReview(sessionId, rating, note);
    onClose();
  };

  return (
    <Sheet title="Seans nasıl geçti?" onClose={onClose} closeLabel="Atla" action={{ label: 'Kaydet', onClick: save }}>
      <div class="form">
        <div class="field">
          <span class="label">Değerlendirme (isteğe bağlı, 0-10)</span>
          <div class="rating-row of11" role="radiogroup" aria-label="Seans değerlendirmesi, 0 ile 10 arası">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <button key={n} role="radio" aria-checked={rating === n} class={`rating-dot ${rating === n ? 'on' : ''}`} onClick={() => setRating(rating === n ? null : n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <label class="field">
          <span class="label">Not (isteğe bağlı)</span>
          <textarea class="input journal-textarea" placeholder="Bu seansta neye odaklandın, nasıl geçti?" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
      </div>
    </Sheet>
  );
}
