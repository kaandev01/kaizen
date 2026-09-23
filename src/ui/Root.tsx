import { useEffect, useRef, useState } from 'preact/hooks';
import { systemClock } from '../core/dates';
import { openBestStorage, type Storage } from '../storage/storage';
import { Store } from '../storage/store';
import { checkLegacyMigration, importLegacyData, type LegacyMigration } from '../sync/migrate';
import { supabase } from '../sync/supabaseClient';
import { SyncEngine } from '../sync/engine';
import { App } from './App';
import { AuthScreen } from './AuthScreen';
import { ConfirmDialog } from './components';
import { setStore } from './hooks';
import { setSessionUser } from './session';
import { setSyncStatus } from './syncStatus';

type Phase = 'loading' | 'config-missing' | 'boot-error' | 'unauthed' | 'recovery' | 'authed';

const SUMMARY_LABELS: [keyof LegacyMigration['summary'], string][] = [
  ['habits', 'alışkanlık'],
  ['logs', 'günlük kayıt'],
  ['pomoSessions', 'Pomodoro seansı'],
  ['journal', 'günlük notu'],
  ['ratings', 'gün puanı'],
  ['agenda', 'ajanda kaydı'],
  ['goals', 'hedef'],
];

/**
 * Uygulamanın en üstü: oturum durumuna göre AuthScreen/App arasında geçiş
 * yapar, hesap başına ayrı bir yerel veritabanı (`kaizen-${userId}`) açar,
 * SyncEngine'i başlatır/durdurur ve ilk girişte eski yerel veriyi hesaba
 * aktarma teklifini yönetir. main.tsx bunu tek başına render eder.
 */
export function Root() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [migration, setMigration] = useState<LegacyMigration | null>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const migrationCtx = useRef<{ userId: string; storage: Storage } | null>(null);
  const migratingRef = useRef(false);
  const engineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    if (!supabase) {
      setPhase('config-missing');
      return;
    }
    const client = supabase; // bkz. AuthScreen.tsx'teki aynı narrowing notu
    let cancelled = false;

    const openForUser = async (userId: string | null) => {
      engineRef.current?.stop();
      engineRef.current = null;
      setSyncStatus('offline');

      const dbName = userId ? `kaizen-${userId}` : 'kaizen';
      const { storage, fallbackReason } = await openBestStorage(dbName);
      if (fallbackReason) console.warn('Bellek deposuna geçildi:', fallbackReason);
      const store = new Store(storage, systemClock);
      await store.init();
      if (cancelled) return;
      void navigator.storage?.persist?.();
      setStore(store);

      if (userId) {
        const engine = new SyncEngine(storage, store, userId, setSyncStatus);
        engineRef.current = engine;
        engine.start();

        const alreadyHandled = !!(await storage.getMeta<{ userId: string }>('migratedToCloud'));
        const legacy = await checkLegacyMigration(alreadyHandled);
        if (!cancelled && legacy) {
          migrationCtx.current = { userId, storage };
          setMigration(legacy);
        }
      }
    };

    const applySession = (uid: string | null, email: string | null) => {
      setSessionUser(uid ? { id: uid, email } : null);
      return openForUser(uid)
        .then(() => {
          if (!cancelled) setPhase(uid ? 'authed' : 'unauthed');
        })
        .catch((e) => {
          console.error('Açılış başarısız', e);
          if (!cancelled) setPhase('boot-error');
        });
    };

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      void applySession(data.session?.user.id ?? null, data.session?.user.email ?? null);
    });

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPhase('recovery');
        return;
      }
      void applySession(session?.user.id ?? null, session?.user.email ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      engineRef.current?.stop();
    };
  }, []);

  const confirmMigration = async () => {
    if (migratingRef.current || !migration || !migrationCtx.current) return;
    migratingRef.current = true;
    setMigrateError(null);
    try {
      await importLegacyData(migrationCtx.current.userId, migration.snapshot);
      await migrationCtx.current.storage.putMeta('migratedToCloud', { userId: migrationCtx.current.userId });
      setMigration(null);
    } catch (e) {
      setMigrateError(e instanceof Error ? e.message : 'Aktarım başarısız oldu. Tekrar deneyebilirsin.');
    } finally {
      migratingRef.current = false;
    }
  };

  const skipMigration = async () => {
    if (migrationCtx.current) await migrationCtx.current.storage.putMeta('migratedToCloud', { userId: migrationCtx.current.userId });
    setMigration(null);
  };

  if (phase === 'loading') {
    return (
      <div class="splash-screen">
        <p class="hint">Yükleniyor…</p>
      </div>
    );
  }
  if (phase === 'boot-error') {
    return (
      <div class="splash-screen">
        <p class="hint">Kaizen başlatılamadı. Sayfayı yenilemeyi dene.</p>
      </div>
    );
  }
  if (phase === 'config-missing') return <AuthScreen />;
  if (phase === 'recovery') return <AuthScreen initialMode="reset" />;
  if (phase === 'unauthed') return <AuthScreen />;

  return (
    <>
      <App />
      {migration && (
        <ConfirmDialog
          title="Bu cihazdaki veriler hesabına aktarılsın mı?"
          message={
            <>
              <p>Bu cihazda, giriş yapılmadan önce oluşturulmuş veriler bulundu. Hesabına aktarmak ister misin? Cihazdaki veriler hiçbir şekilde silinmez.</p>
              <table class="restore-table">
                <tbody>
                  {SUMMARY_LABELS.filter(([key]) => migration.summary[key] > 0).map(([key, label]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{migration.summary[key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {migrateError && (
                <p class="error" role="alert">
                  {migrateError}
                </p>
              )}
            </>
          }
          confirmLabel="Aktar"
          onCancel={() => void skipMigration()}
          onConfirm={() => void confirmMigration()}
        />
      )}
    </>
  );
}
