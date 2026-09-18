// WCAG contrast check: text-white/NN sobre night-*
// blended = bg*(1-a) + white*a
const bgs = {
  "night-950": "#0a0a0f",
  "night-900": "#12121a",
  "night-800": "#1c1c28",
  "night-700": "#2a2a3a",
};

const hexToRgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const srgb = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);

const contrast = (l1, l2) => {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

const alphas = [30, 40, 50, 60, 70, 80, 90, 100];

console.log("bg          alpha  blended    ratio");
for (const [name, hex] of Object.entries(bgs)) {
  const bg = hexToRgb(hex);
  const bgLum = lum(bg);
  for (const a of alphas) {
    const blend = bg.map((c) =>
      Math.round(c * (1 - a / 100) + 255 * (a / 100))
    );
    const ratio = contrast(lum(blend), bgLum);
    const blendedHex =
      "#" + blend.map((c) => c.toString(16).padStart(2, "0")).join("");
    console.log(
      `${name.padEnd(11)} ${String(a).padStart(3)}%   ${blendedHex}    ${ratio.toFixed(2)}:1`
    );
  }
  console.log("");
}
