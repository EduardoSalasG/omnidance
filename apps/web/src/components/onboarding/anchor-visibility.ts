/**
 * Un anchor de tour califica solo si es visible EN el viewport: tener
 * rects no basta - la appbar oculta con `translateY(-100%)` (clase
 * `.appbar-hidden` al scrollear) devuelve rects válidos con bottom <= 0
 * y driver.js anclaría el popover a un elemento fuera de pantalla.
 * La intersección parcial también califica (driver hace flip/clamp).
 */
export function isAnchorVisible(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.getClientRects().length === 0) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return (
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < window.innerHeight &&
    r.left < window.innerWidth
  );
}
