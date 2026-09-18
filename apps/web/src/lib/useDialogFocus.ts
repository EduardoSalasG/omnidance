"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

/**
 * Focus trap + restauración para diálogos montados condicionalmente
 * (bottom sheets, modales). Al abrirse guarda el elemento enfocado,
 * mueve el foco al primer control del diálogo y cicla Tab/Shift+Tab
 * dentro; al cerrarse (open → false o desmontaje) devuelve el foco
 * al elemento que lo tenía.
 *
 * Uso:
 *   const dialogRef = useDialogFocus<HTMLDivElement>(open);
 *   <div ref={dialogRef}> ...contenido del diálogo... </div>
 *
 * El ref puede ir en el overlay que envuelve al role="dialog" — el
 * ciclo de Tab solo considera los controles dentro del contenedor.
 */
export function useDialogFocus<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement;
    const root: T = node;

    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Foco inicial: primer control del diálogo (o el contenedor si no hay).
    const first = focusables()[0];
    if (first) {
      first.focus();
    } else {
      if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
      node.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      const inside = active != null && root.contains(active);

      if (e.shiftKey && (!inside || active === firstItem)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (!inside || active === lastItem)) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  return ref;
}
