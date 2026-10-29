"use client";

// Multiselect compacto de instructores (spec serie habilita -> slot
// asigna): checkbox list sobre el roster disponible. El primero en la
// respuesta del backend queda como primario.
export function InstructorChecklist({
  options,
  selected,
  onChange,
  disabled,
}: {
  options: { id: string; name: string | null }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }
  if (options.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-1.5" role="group">
      {options.map((o) => (
        <li key={o.id}>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-elevated px-3 py-2 text-sm transition-colors has-checked:border-neon/50 has-checked:bg-neon/10">
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              disabled={disabled}
              onChange={() => toggle(o.id)}
              className="size-4 accent-neon"
            />
            {o.name ?? o.id.slice(0, 8)}
          </label>
        </li>
      ))}
    </ul>
  );
}
