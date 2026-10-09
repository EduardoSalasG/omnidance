"use client";

import { useSyncExternalStore } from "react";

// Presencia de ConsoleHeader en la página actual: el header de consola
// ya renderiza el back al padre (link real, deep-link safe), así que el
// chevron ‹ del appbar se suprime mientras esté montado - si no, cada
// página empujada de consola mostraría dos botones de volver. Contador
// (no boolean) por si alguna página llegara a anidar dos headers.
const CHANGE = "omnidance:console-header";
let mounted = 0;
const subs = new Set<() => void>();

const emit = () => subs.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export function reportConsoleHeader(on: boolean): void {
  const next = Math.max(0, mounted + (on ? 1 : -1));
  if (next === mounted) return;
  mounted = next;
  emit();
}

export function useConsoleHeaderPresent(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mounted > 0,
    () => false,
  );
}
