import { useSyncExternalStore } from "react";

// Regla de paginación de consolas (spec academy-cobros-reporte):
// 20 ítems por página en desktop (≥lg), 10 en mobile.
// useSyncExternalStore suscribe el media query sin render extra -
// mismo patrón que LG_QUERY en staff/[eventId].
const LG_QUERY = "(min-width: 1024px)";

const subscribeLg = (onChange: () => void) => {
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const getLgSnapshot = () => window.matchMedia(LG_QUERY).matches;
// SSR/hidratación: mobile-first, el default chico nunca recorta de más.
const getLgServerSnapshot = () => false;

/** pageSize responsivo para listas pesadas de consola: 20 desktop / 10 mobile. */
export function useConsolePageSize(): number {
  return useSyncExternalStore(subscribeLg, getLgSnapshot, getLgServerSnapshot)
    ? 20
    : 10;
}
