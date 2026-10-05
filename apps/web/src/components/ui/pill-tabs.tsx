"use client";

export type PillTabItem = {
  key: string;
  label: string;
};

export type PillTabsProps = {
  items: PillTabItem[];
  /** Key de la pill activa (controlled — el padre guarda el estado). */
  active: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
};

/**
 * Strip de pills deslizable estilo segmented iOS (mismo look que CrmNav):
 * scroll horizontal sin scrollbar, pill activa en neon. Button-based con
 * role="tablist"/"tab" + aria-selected — el patrón correcto para cambiar
 * qué vista se muestra (filtros/lentes), no para navegar entre rutas.
 * Cada pill es un tab stop propio; ≥44px de alto para touch.
 */
export function PillTabs({ items, active, onSelect, ariaLabel }: PillTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-2 overflow-x-auto no-scrollbar"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={active === item.key}
          onClick={() => onSelect(item.key)}
          className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
            active === item.key
              ? "bg-neon text-black"
              : "bg-white/10 text-white/70 hover:text-white"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
