import type { Config } from "tailwindcss";

// Design tokens - dark-first (la app se usa de noche en locales oscuros).
// Theming claro/oscuro: los colores semánticos (canvas/surface/elevated/
// raised/ink/line/on-accent) son CSS vars que swappean por .light/.dark
// en <html> (ver globals.css + lib/theme.ts). night-* mapea a las mismas
// vars por compatibilidad durante la migración - código nuevo usa los
// nombres semánticos.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
        // Advertencia semántica - amber-700 en claro / amber-300 en
        // oscuro (globals.css). Reemplaza los literales amber-*.
        warn: "rgb(var(--warn) / <alpha-value>)",
        night: {
          950: "rgb(var(--canvas) / <alpha-value>)",
          900: "rgb(var(--surface) / <alpha-value>)",
          800: "rgb(var(--elevated) / <alpha-value>)",
          700: "rgb(var(--raised) / <alpha-value>)",
          600: "rgb(var(--raised) / <alpha-value>)",
        },
        neon: {
          // CSS vars - swappean por modo de vista (data-mode en <html>) Y
          // por tema (light/dark): Social = morado, Academia = verde.
          // Marca lime vive en icon.svg/OG/PWA (estáticos, fuera del
          // theming).
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
