import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon, type IconName } from './icons';

export { Icon };

/** İlerleme halkası. ratio 0..1. */
export function Ring(props: {
  ratio: number;
  size: number;
  stroke: number;
  label: string;
  valueText: string;
  children?: ComponentChildren;
  class?: string;
}) {
  const r = (props.size - props.stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(Math.max(props.ratio, 0), 1);
  const mid = props.size / 2;
  return (
    <div
      class={`ring ${props.class ?? ''}`}
      style={{ width: props.size, height: props.size } as JSX.CSSProperties}
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(ratio * 100)}
      aria-valuetext={props.valueText}
    >
      <svg width={props.size} height={props.size} viewBox={`0 0 ${props.size} ${props.size}`} aria-hidden="true">
        <circle class="ring-track" cx={mid} cy={mid} r={r} fill="none" stroke-width={props.stroke} />
        <circle
          class="ring-fill"
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke-width={props.stroke}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      <div class="ring-center">{props.children}</div>
    </div>
  );
}

/**
 * Alttan açılan sayfa. Başlık satırı Stitch tasarımındaki gibi:
 * solda vazgeç, ortada başlık, sağda (varsa) ana eylem.
 */
export function Sheet(props: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  closeLabel?: string;
  action?: { label: string; onClick: () => void };
  tall?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div class="backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class={`sheet ${props.tall ? 'tall' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref} tabIndex={-1}>
        <div class="sheet-handle" aria-hidden="true" />
        <div class="sheet-head">
          <button class="text-btn" onClick={props.onClose}>
            {props.closeLabel ?? 'Vazgeç'}
          </button>
          <h2>{props.title}</h2>
          {props.action ? (
            <button class="text-btn strong" onClick={props.action.onClick}>
              {props.action.label}
            </button>
          ) : (
            <span class="text-btn ghost" aria-hidden="true" />
          )}
        </div>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog(props: {
  title: string;
  message: ComponentChildren;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div class="backdrop center" onClick={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-label={props.title} ref={ref} tabIndex={-1}>
        <h2>{props.title}</h2>
        <div class="dialog-msg">{props.message}</div>
        <div class="dialog-actions">
          <button class="btn" onClick={props.onCancel}>
            Vazgeç
          </button>
          <button class={`btn ${props.danger ? 'danger' : 'primary'}`} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      class={`switch ${props.checked ? 'on' : ''}`}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="knob" />
    </button>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  class?: string;
}) {
  return (
    <div class={`segmented ${props.class ?? ''}`} role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={props.value === o.value}
          class={props.value === o.value ? 'on' : ''}
          disabled={props.disabled}
          onClick={() => props.onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper(props: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; suffix?: string }) {
  const step = props.step ?? 1;
  // Büyük adımlarda en yakın katına yaslanır (1 → 5 → 10 …), alt/üst sınır korunur.
  const move = (dir: 1 | -1) => {
    const raw = props.value + dir * step;
    const snapped = step > 1 ? Math.round(raw / step) * step : raw;
    props.onChange(Math.min(props.max, Math.max(props.min, snapped)));
  };
  return (
    <div class="stepper" role="group" aria-label={props.label}>
      <button class="round-btn sm" aria-label={`${props.label}: azalt`} disabled={props.value <= props.min} onClick={() => move(-1)}>
        <Icon name="minus" size={18} />
      </button>
      <span class="stepper-val" aria-live="polite">
        {props.value}
        {props.suffix ? ` ${props.suffix}` : ''}
      </span>
      <button class="round-btn sm" aria-label={`${props.label}: artır`} disabled={props.value >= props.max} onClick={() => move(1)}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}
