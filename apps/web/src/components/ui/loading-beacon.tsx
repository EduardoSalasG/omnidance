"use client";

import { useEffect } from "react";

// Beacon de carga compartido — una sola fuente para el spinner de
// transición: el overlay de navegación (nav-pending) y cada PageLoading
// hacen acquire/release sobre un contador. El store aplica el estándar
// de carga percibida (NN/g) una sola vez:
//  - SHOW_DELAY_MS: <200ms se siente instantáneo → nunca mostrar.
//  - MIN_VISIBLE_MS: una vez visible, mantenerlo — un spinner de 50ms
//    es "flash" y hace la app sentirse más lenta.
// La transición overlay→página queda seamless: el beacon no se apaga
// mientras quede al menos un consumidor activo (nav resolviendo O la
// página destino cargando datos).

const SHOW_DELAY_MS = 200;
const MIN_VISIBLE_MS = 400;

let count = 0;
let visible = false;
let shownAt: number | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  emit();
}

export function acquirePageLoading() {
  count += 1;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (shownAt === null && !showTimer) {
    showTimer = setTimeout(() => {
      showTimer = null;
      shownAt = Date.now();
      setVisible(true);
    }, SHOW_DELAY_MS);
  }
}

export function releasePageLoading() {
  count = Math.max(0, count - 1);
  if (count > 0) return;
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (shownAt === null) return; // nunca llegó a mostrarse — no fue flash
  const elapsed = Date.now() - shownAt;
  hideTimer = setTimeout(() => {
    shownAt = null;
    setVisible(false);
  }, Math.max(0, MIN_VISIBLE_MS - elapsed));
}

/** Para consumidores booleanos (nav overlay): acquire mientras `active`. */
export function useLoadingBeacon(active: boolean) {
  useEffect(() => {
    if (!active) return;
    acquirePageLoading();
    return releasePageLoading;
  }, [active]);
}

// Montado por PageLoading — adquiere el beacon por el tiempo de vida del
// componente y lo suelta al desmontar (cuando llega la data).
export function PageLoadingBeacon() {
  useLoadingBeacon(true);
  return null;
}

export function subscribeLoading(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getLoadingVisible = () => visible;
