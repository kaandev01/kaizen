import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatClockTime, type DateKey } from '../core/dates';
import type { JournalEntry } from '../core/types';
import { ConfirmDialog, Icon } from './components';
import { useAppState, useStore } from './hooks';
import { createSpeechController, speechSupport, type SpeechController } from './speech';

/**
 * Bir günün puanı + notları. Hem Bugün ekranındaki küçük mikrofon
 * düğmesinden (yalnızca bugün için) hem de Takvim gün detayından (herhangi
 * bir gün için) aynı bileşen kullanılır.
 */
export function JournalPanel({ date }: { date: DateKey }) {
  const store = useStore();
  const { journal, ratings } = useAppState();
  const entries = useMemo(
    () => journal.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt),
    [journal, date],
  );
  const rating = ratings[date]?.score ?? null;

  return (
    <div class="journal-panel">
      <div class="field">
        <span class="label">Gün puanı (isteğe bağlı)</span>
        <div class="rating-row" role="radiogroup" aria-label="Gün puanı, 1 ile 10 arası">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={rating === n}
              class={`rating-dot ${rating === n ? 'on' : ''}`}
              onClick={() => store.setRating(date, rating === n ? null : n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div class="field">
        <span class="label">Notlar</span>
        {entries.length === 0 ? (
          <p class="hint">Bu güne henüz not eklenmedi.</p>
        ) : (
          <ul class="journal-list">
            {entries.map((e) => (
              <JournalEntryRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
        <Composer date={date} />
      </div>
    </div>
  );
}

function JournalEntryRow({ entry }: { entry: JournalEntry }) {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (editing) {
    return (
      <li class="journal-entry editing">
        <textarea class="input journal-textarea" value={draft} onInput={(e) => setDraft(e.currentTarget.value)} />
        <div class="row gap">
          <button
            class="btn block"
            onClick={() => {
              setEditing(false);
              setDraft(entry.text);
            }}
          >
            Vazgeç
          </button>
          <button
            class="btn primary block"
            disabled={!draft.trim()}
            onClick={() => {
              store.updateJournalEntry(entry.id, draft);
              setEditing(false);
            }}
          >
            Kaydet
          </button>
        </div>
      </li>
    );
  }

  return (
    <>
      <li class="journal-entry">
        <div class="journal-entry-head">
          <span class="muted small">
            <Icon name={entry.source === 'speech' ? 'mic' : 'pencil'} size={13} /> {formatClockTime(entry.createdAt)}
          </span>
          <span class="row gap-sm">
            <button class="round-btn sm" aria-label="Notu düzenle" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={15} />
            </button>
            <button class="round-btn sm" aria-label="Notu sil" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={15} />
            </button>
          </span>
        </div>
        <p class="journal-text">{entry.text}</p>
      </li>
      {confirmDelete && (
        <ConfirmDialog
          title="Not silinsin mi?"
          message="Bu not kalıcı olarak silinecek."
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            store.deleteJournalEntry(entry.id);
            setConfirmDelete(false);
          }}
        />
      )}
    </>
  );
}

function Composer({ date }: { date: DateKey }) {
  const store = useStore();
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [recording, setRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [source, setSource] = useState<JournalEntry['source']>('typed');
  const support = useMemo(() => speechSupport(), []);
  const controllerRef = useRef<SpeechController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.stop();
    },
    [],
  );

  const toggleMic = () => {
    if (recording) {
      controllerRef.current?.stop();
      return;
    }
    setSpeechError(null);
    const controller = createSpeechController({
      onFinal: (text) => {
        const t = text.trim();
        if (!t) return;
        setSource('speech');
        setDraft((d) => (d ? `${d.trimEnd()} ${t}` : t)); // mevcut metni silmeden ekler
        setInterim('');
      },
      onInterim: setInterim,
      onError: (message) => {
        // Tanıma hatasında yazılmış metin korunur; yalnızca bilgilendirme gösterilir.
        setSpeechError(message);
        setInterim('');
      },
      onEnd: () => {
        setRecording(false);
        setInterim('');
      },
    });
    if (!controller) return; // desteklenmiyor; mikrofon düğmesi zaten gizli
    controllerRef.current = controller;
    setRecording(true);
    controller.start();
  };

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    store.addJournalEntry(date, text, source);
    setDraft('');
    setInterim('');
    setSource('typed');
  };

  return (
    <div class="journal-compose">
      <textarea
        class="input journal-textarea"
        placeholder="Bugün nasıl geçti?"
        value={interim ? `${draft}${draft ? ' ' : ''}${interim}` : draft}
        onInput={(e) => {
          setSource('typed');
          setDraft(e.currentTarget.value);
        }}
      />
      {recording && (
        <p class="rec-indicator" role="status">
          <span class="rec-dot" aria-hidden="true" /> Dinleniyor…
        </p>
      )}
      {speechError && <p class="hint warn">{speechError}</p>}
      {support === 'unsupported' && <p class="hint">Bu cihazda/tarayıcıda sesle giriş desteklenmiyor; yazarak ekleyebilirsin.</p>}
      <div class="row gap">
        {support === 'ready' && (
          <button
            class={`round-btn lg mic-btn ${recording ? 'recording' : ''}`}
            aria-label={recording ? 'Kaydı durdur' : 'Sesle yaz'}
            onClick={toggleMic}
          >
            <Icon name={recording ? 'micOff' : 'mic'} size={22} />
          </button>
        )}
        <button class="btn primary block" disabled={!draft.trim()} onClick={save}>
          Kaydet
        </button>
      </div>
    </div>
  );
}
