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
