"use client";

import { useRef, useState } from "react";

export type Gender = "M" | "F" | "OTHER";

// Segmented control del género (nullable): tap en la opción activa la
// desmarca → "sin declarar" (PATCH /me con gender null). Radiogroup con
// roving tabindex - las flechas mueven la selección, un solo tab stop.
// Compartido por /perfil/datos y /bienvenida.
export function GenderGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: Gender; label: string }[];
  value: Gender | null;
  onChange: (v: Gender | null) => void;
}) {
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const checkedIdx = value ? options.findIndex((o) => o.value === value) : -1;
  const tabbable = focusIdx ?? (checkedIdx >= 0 ? checkedIdx : 0);

  function pick(idx: number) {
    const v = options[idx].value;
    onChange(v === value ? null : v);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = (idx + delta + options.length) % options.length;
    setFocusIdx(next);
    onChange(options[next].value);
    groupRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [next]?.focus();
  }

  return (
    <div ref={groupRef} role="radiogroup" aria-label={label}>
      <span className="text-xs uppercase tracking-wide text-white/50">
        {label}
      </span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o, idx) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={idx === tabbable ? 0 : -1}
              onClick={() => pick(idx)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              onFocus={() => setFocusIdx(idx)}
              onBlur={(e) => {
                if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
                  setFocusIdx(null);
                }
              }}
              className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon active:scale-[0.98] motion-reduce:active:scale-100 ${
                active
                  ? "border-neon bg-neon text-night-950"
                  : "border-night-700 bg-night-800 text-white/70 hover:text-white"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
