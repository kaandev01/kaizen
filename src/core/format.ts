/** Süre biçimlendirme — Pomodoro geçmişi ve gün özetlerinde ortak kullanılır. */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} dakika`;
  if (m === 0) return `${h} saat`;
  return `${h} saat ${m} dakika`;
}

/** Örn. "4 Pomodoro · 1 saat 40 dakika". */
export function formatFocusSummary(completedCount: number, activeMs: number): string {
  return `${completedCount} Pomodoro · ${formatDuration(activeMs)}`;
}

/**
 * "kez" (genel/sayaç birimi) görsel olarak gösterilmez — "1 kez" yerine
 * yalın "1" yeterli; "bardak", "sayfa" gibi anlamlı birimler gösterilmeye
 * devam eder. Yalnızca gösterim kuralı: saklanan `unit` değeri değişmez.
 */
export function showUnit(unit: string): boolean {
  return unit.trim().length > 0 && unit !== 'kez';
}
