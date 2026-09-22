/**
 * Türkçe konuşmayı metne çeviren tarayıcı API'sinin (Web Speech API,
 * `SpeechRecognition`/`webkitSpeechRecognition`) ince bir sarmalayıcısı.
 *
 * DÜRÜST SINIRLAR — bunlar tasarım kusuru değil, tarayıcı gerçeğidir:
 *  - iOS Safari bu API'yi (yazının yazıldığı tarihte) DESTEKLEMEZ. Böyle bir
 *    cihazda `speechSupport()` 'unsupported' döner ve yazılı giriş kullanılır.
 *  - Destekleyen tarayıcılarda (ör. masaüstü Chrome) tanıma genellikle
 *    SUNUCU TABANLIDIR ve İNTERNET GEREKTİRİR; cihazda/çevrimdışı çalıştığı
 *    garanti edilmez. Bu dosya bunu asla aksini iddia etmez.
 *  - Ham ses hiçbir zaman saklanmaz; yalnızca tanınan metin (ve o da
 *    kullanıcı "Kaydet" demeden) kalıcı olur.
 */

interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechErrorLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: SpeechErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function ctor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechSupport = 'unsupported' | 'ready';
export const speechSupport = (): SpeechSupport => (ctor() ? 'ready' : 'unsupported');

export interface SpeechController {
  start(): void;
  stop(): void;
}

export interface SpeechCallbacks {
  /** Nihai (kesinleşmiş) bir parça tanındığında — mevcut metni SİLMEDEN eklenmelidir. */
  onFinal: (text: string) => void;
  /** Henüz kesinleşmemiş, canlı önizleme (kaydedilmez, yalnızca gösterim için). */
  onInterim?: (text: string) => void;
  /** Tanıma hatası — MEVCUT yazılmış metin korunmalı, yalnızca kullanıcıya bilgi verilmeli. */
  onError: (message: string) => void;
  onEnd: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Mikrofon izni verilmedi.',
  'service-not-allowed': 'Bu tarayıcıda konuşma tanıma servisi kullanılamıyor.',
  'no-speech': 'Konuşma algılanmadı.',
  network: 'Bağlantı sorunu nedeniyle tanıma başarısız oldu.',
  aborted: 'Kayıt durduruldu.',
};

/** Desteklenmiyorsa null döner — çağıran taraf yazılı girişe düşmelidir. */
export function createSpeechController(cb: SpeechCallbacks): SpeechController | null {
  const Ctor = ctor();
  if (!Ctor) return null;

  let recognition: SpeechRecognitionLike | null = null;
  let active = false;

  const build = () => {
    const r = new Ctor();
    r.lang = 'tr-TR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) cb.onFinal(text);
        else interim += text;
      }
      if (interim) cb.onInterim?.(interim);
    };
    r.onerror = (e) => {
      active = false;
      cb.onError(ERROR_MESSAGES[e.error] ?? 'Tanıma sırasında bir sorun oluştu.');
    };
    r.onend = () => {
      active = false;
      cb.onEnd();
    };
    return r;
  };

  return {
    start() {
      if (active) return;
      recognition = build();
      active = true;
      try {
        recognition.start();
      } catch {
        active = false;
        cb.onError('Kayıt başlatılamadı.');
      }
    },
    stop() {
      if (!active || !recognition) return;
      recognition.stop();
    },
  };
}
