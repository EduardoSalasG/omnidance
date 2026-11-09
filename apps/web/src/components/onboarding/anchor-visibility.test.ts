// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { isAnchorVisible } from "./anchor-visibility";

const rect = (top: number, left: number, bottom: number, right: number) =>
  ({
    top,
    left,
    bottom,
    right,
    width: right - left,
    height: bottom - top,
  }) as DOMRect;

const el = (rects: DOMRect[]): HTMLElement => {
  const e = document.createElement("div");
  e.getClientRects = () =>
    Object.assign([...rects], {
      item: (i: number) => rects[i] ?? null,
    }) as unknown as DOMRectList;
  e.getBoundingClientRect = () => rects[0] ?? rect(0, 0, 0, 0);
  return e;
};

// jsdom viewport por defecto: 1024x768.
describe("isAnchorVisible (anchors de tour)", () => {
  it("excluye elementos sin rects (display:none)", () => {
    expect(isAnchorVisible(el([]))).toBe(false);
  });

  it("excluye la appbar oculta por translateY(-100%)", () => {
    // appbar-hidden: el rect queda sobre el viewport (bottom <= 0)
    // pero getClientRects() sigue devolviendo rects válidos.
    expect(isAnchorVisible(el([rect(-60, 0, -4, 1024)]))).toBe(false);
  });

  it("excluye elementos totalmente por debajo del viewport", () => {
    expect(isAnchorVisible(el([rect(800, 0, 840, 300)]))).toBe(false);
  });

  it("excluye elementos totalmente fuera a la derecha", () => {
    expect(isAnchorVisible(el([rect(10, 1100, 60, 1200)]))).toBe(false);
  });

  it("incluye elementos parcialmente visibles arriba", () => {
    expect(isAnchorVisible(el([rect(-20, 10, 40, 300)]))).toBe(true);
  });

  it("incluye elementos visibles", () => {
    expect(isAnchorVisible(el([rect(10, 10, 60, 300)]))).toBe(true);
  });

  it("excluye nodos que no son HTMLElement", () => {
    expect(isAnchorVisible(document.createTextNode("x") as unknown as Element)).toBe(false);
  });
});
